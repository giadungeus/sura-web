import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { optionsKey } from "@/lib/cart-key";
import { KNOWN_COLUMNS, REQUIRED_HEADERS } from "@/lib/import/columns";
import { normalizeVietnamese } from "@/lib/search";
import { SKU_PATTERN, slugify, uniqueSlug } from "@/lib/slug";
import { PRICE_MAX, PRICE_MIN, STOCK_MAX } from "@/lib/server/admin-catalog";
import { MAX_IMAGES_PER_PRODUCT } from "@/lib/server/images";
import type { SelectedOptions } from "@/types";

/**
 * Lập kế hoạch nhập từ các dòng CSV. CHỈ ĐỌC CSDL, không ghi gì: dùng cho bước
 * xem trước, và được chạy lại trong giao dịch ghi để kiểm tra trên dữ liệu mới nhất.
 */

export type ImportRow = Record<string, string> & { __line: string };
export type RowIssue = { line: number; column?: string; message: string };

export type PlannedVariant = {
  line: number;
  sku: string;
  options: SelectedOptions;
  key: string;
  existingId: number | null;
  action: "new" | "update" | "unchanged";
  /** undefined = giữ nguyên giá trị hiện có. */
  price?: number;
  compareAtPrice?: number;
  stock?: number;
  cost?: number;
  changes: string[];
};

export type CategoryRef = { id: number } | { newKey: string };

export type PlannedProduct = {
  key: string;
  source: string;
  code: string;
  firstLine: number;
  existingId: string | null;
  action: "new" | "update" | "unchanged";
  name?: string;
  slug?: string;
  category?: CategoryRef;
  categoryLabel?: string;
  /** Biểu tượng minh hoạ khi chưa có ảnh (lấy theo danh mục). */
  placeholderIcon: string;
  brand?: string;
  shortDescription?: string;
  description?: string;
  highlights?: string[];
  optionNames: string[];
  variants: PlannedVariant[];
  imageUrls: string[];
  changes: string[];
};

export type PlannedCategory = { key: string; name: string; label: string; slug: string; parent: CategoryRef | null };

export type ImportStats = {
  rows: number;
  productsNew: number;
  productsUpdate: number;
  productsUnchanged: number;
  variantsNew: number;
  variantsUpdate: number;
  variantsUnchanged: number;
  categoriesNew: number;
  imagesToDownload: number;
  errors: number;
  warnings: number;
};

export type ImportPlan = {
  products: PlannedProduct[];
  categories: PlannedCategory[];
  errors: RowIssue[];
  warnings: RowIssue[];
  stats: ImportStats;
};

// ───────────── Chuẩn hoá giá trị ─────────────

const SOURCE_PATTERN = /^[a-z0-9][a-z0-9-]{1,29}$/;
const MAX_IMAGE_URL = 2048;

function clean(value: string | undefined, max: number): string {
  return (value ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max + 1);
}

function cleanMultiline(value: string | undefined, max: number): string {
  return (value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max + 1);
}

/** "459.000", "459,000", "459000", "459 000 đ" -> 459000; null nếu trống; NaN nếu sai. */
function parseMoney(value: string | undefined): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\s|đ|₫|vnđ|vnd/gi, "");
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(cleaned)) return Number.NaN;
  const n = Number(cleaned.replace(/[.,]/g, ""));
  return Number.isSafeInteger(n) ? n : Number.NaN;
}

function parseCount(value: string | undefined): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[\s.,]/g, "");
  if (!/^\d+$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

function readOptions(row: ImportRow, line: number, errors: RowIssue[]): { names: string[]; options: SelectedOptions } {
  const names: string[] = [];
  const options: SelectedOptions = {};
  for (let i = 1; i <= 3; i++) {
    const name = clean(row[`thuoc_tinh_${i}`], 30);
    const value = clean(row[`gia_tri_${i}`], 40);
    if (!name && !value) continue;
    if (!name || !value) {
      errors.push({ line, column: `thuoc_tinh_${i}`, message: `Thuộc tính ${i}: cần có cả tên (thuoc_tinh_${i}) và giá trị (gia_tri_${i}).` });
      continue;
    }
    if (name.length > 30 || value.length > 40) {
      errors.push({ line, column: `thuoc_tinh_${i}`, message: `Thuộc tính ${i}: tên tối đa 30 ký tự, giá trị tối đa 40 ký tự.` });
      continue;
    }
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) {
      errors.push({ line, column: `thuoc_tinh_${i}`, message: `Thuộc tính “${name}” bị lặp trên cùng dòng.` });
      continue;
    }
    names.push(name);
    options[name] = value;
  }
  return { names, options };
}

function parseImageUrls(value: string | undefined, line: number, errors: RowIssue[]): string[] {
  const urls: string[] = [];
  for (const part of (value ?? "").split("|").map((s) => s.trim()).filter(Boolean)) {
    let ok = false;
    try {
      const u = new URL(part);
      ok = (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password && part.length <= MAX_IMAGE_URL;
    } catch {
      ok = false;
    }
    if (!ok) errors.push({ line, column: "anh", message: `URL ảnh không hợp lệ (chỉ nhận http/https): ${part.slice(0, 80)}` });
    else urls.push(part);
  }
  return urls;
}

// ───────────── Danh mục theo đường dẫn tên ─────────────

type CategoryRow = { id: number; name: string; slug: string; parent_id: number | null; icon: string };

class CategoryResolver {
  private readonly rows: CategoryRow[];
  private readonly slugs: Set<string>;
  readonly planned = new Map<string, PlannedCategory>();

  constructor(db: DatabaseSync) {
    this.rows = db.prepare("SELECT id, name, slug, parent_id, icon FROM categories").all() as CategoryRow[];
    this.slugs = new Set(this.rows.map((r) => r.slug));
  }

  private uniqueSlug(base: string): string {
    const slug = uniqueSlug(base || "danh-muc", (s) => this.slugs.has(s));
    this.slugs.add(slug);
    return slug;
  }

  /** Tìm danh mục theo đường dẫn “A > B > C”; phần chưa có được lên kế hoạch tạo mới. */
  resolve(path: string[]): { ref: CategoryRef; icon: string } {
    let parentId: number | null = null;
    let parentRef: CategoryRef | null = null;
    let icon = "shopping-bag";
    const keyParts: string[] = [];
    const labelParts: string[] = [];
    for (const segment of path) {
      keyParts.push(normalizeVietnamese(segment));
      labelParts.push(segment);
      const key = keyParts.join(">");
      if (parentRef === null || "id" in parentRef) {
        const found = this.rows.find(
          (r) =>
            r.parent_id === parentId &&
            (normalizeVietnamese(r.name) === normalizeVietnamese(segment) || r.slug === slugify(segment)),
        );
        if (found) {
          parentId = found.id;
          parentRef = { id: found.id };
          icon = found.icon;
          continue;
        }
      }
      if (!this.planned.has(key)) {
        this.planned.set(key, { key, name: segment, label: labelParts.join(" > "), slug: this.uniqueSlug(slugify(segment)), parent: parentRef });
      }
      parentRef = { newKey: key };
      parentId = null;
    }
    return { ref: parentRef!, icon };
  }
}

// ───────────── Lập kế hoạch ─────────────

type ExistingProduct = {
  id: string;
  name: string;
  brand: string;
  category_id: number;
  short_description: string;
  description: string;
  highlights_json: string;
  option_names_json: string;
};

type ExistingVariant = {
  id: number;
  product_id: string;
  options_key: string;
  price: number;
  compare_at_price: number | null;
  stock: number;
  cost_price: number | null;
};

export function checkHeaders(headers: string[]): { errors: RowIssue[]; warnings: RowIssue[] } {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  for (const h of REQUIRED_HEADERS) {
    if (!headers.includes(h)) errors.push({ line: 1, column: h, message: `Thiếu cột bắt buộc “${h}”.` });
  }
  const seen = new Set<string>();
  for (const h of headers) {
    if (!h) continue;
    if (seen.has(h)) errors.push({ line: 1, column: h, message: `Cột “${h}” bị lặp.` });
    seen.add(h);
    if (!KNOWN_COLUMNS.has(h)) warnings.push({ line: 1, column: h, message: `Cột “${h}” không được hỗ trợ, sẽ bỏ qua.` });
  }
  return { errors, warnings };
}

export function buildImportPlan(db: DatabaseSync, rows: ImportRow[]): ImportPlan {
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const categories = new CategoryResolver(db);
  const usedSlugs = new Set((db.prepare("SELECT slug FROM products").all() as { slug: string }[]).map((r) => r.slug));

  // 1) Gom dòng theo nguồn + mã sản phẩm; kiểm tra SKU trùng trong file.
  const groups = new Map<string, { source: string; code: string; rows: { row: ImportRow; line: number }[] }>();
  const skuLines = new Map<string, number>();
  for (const row of rows) {
    const line = Number(row.__line);
    const source = clean(row.nguon, 30).toLowerCase();
    const code = clean(row.ma_san_pham, 64);
    const sku = clean(row.sku, 40).toUpperCase();
    let rowOk = true;
    if (!SOURCE_PATTERN.test(source)) {
      errors.push({ line, column: "nguon", message: "Nguồn hàng 2–30 ký tự: chữ thường không dấu, số, gạch ngang (vd. techmall)." });
      rowOk = false;
    }
    if (!code || code.length > 64) {
      errors.push({ line, column: "ma_san_pham", message: "Thiếu mã sản phẩm (tối đa 64 ký tự)." });
      rowOk = false;
    }
    if (!SKU_PATTERN.test(sku)) {
      errors.push({ line, column: "sku", message: "SKU gồm 2–40 ký tự in hoa, số, “-” hoặc “_”." });
      rowOk = false;
    } else if (skuLines.has(sku)) {
      errors.push({ line, column: "sku", message: `SKU ${sku} bị lặp (đã có ở dòng ${skuLines.get(sku)}).` });
      rowOk = false;
    } else skuLines.set(sku, line);
    if (!rowOk) continue;
    const key = `${source}|${code}`;
    const group = groups.get(key) ?? { source, code, rows: [] };
    group.rows.push({ row, line });
    groups.set(key, group);
  }

  const findProduct = db.prepare(
    `SELECT id, name, brand, category_id, short_description, description, highlights_json, option_names_json
     FROM products WHERE source = ? AND source_code = ?`,
  );
  const findVariant = db.prepare(
    "SELECT id, product_id, options_key, price, compare_at_price, stock, cost_price FROM product_variants WHERE sku = ? COLLATE NOCASE AND is_active = 1",
  );
  const productVariants = db.prepare(
    "SELECT id, product_id, options_key, price, compare_at_price, stock, cost_price FROM product_variants WHERE product_id = ? AND is_active = 1",
  );
  const productOwner = db.prepare("SELECT id, source, source_code FROM products WHERE id = ?");
  const existingImageUrls = db.prepare("SELECT source_url FROM product_images WHERE product_id = ? AND source_url IS NOT NULL");
  const imageCount = db.prepare("SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?");

  const products: PlannedProduct[] = [];

  for (const [key, group] of groups) {
    const firstLine = group.rows[0].line;
    const errorCountBefore = errors.length;
    const existing = findProduct.get(group.source, group.code) as ExistingProduct | undefined;

    // Thông tin cấp sản phẩm: lấy giá trị khác rỗng đầu tiên; mâu thuẫn tên/danh mục là lỗi.
    const pick = (column: string, max: number, multiline = false) => {
      let value = "";
      for (const { row, line } of group.rows) {
        const v = multiline ? cleanMultiline(row[column], max) : clean(row[column], max);
        if (!v) continue;
        if (!value) value = v;
        else if (v !== value && (column === "ten_san_pham" || column === "danh_muc"))
          errors.push({ line, column, message: `Khác với dòng ${firstLine} của cùng sản phẩm (${group.code}).` });
      }
      return value;
    };
    const name = pick("ten_san_pham", 150);
    const categoryPath = pick("danh_muc", 300)
      .split(">")
      .map((s) => s.trim())
      .filter(Boolean);
    const brand = pick("thuong_hieu", 60);
    const shortDescription = pick("mo_ta_ngan", 300);
    const description = pick("mo_ta", 5000, true);
    const highlightsRaw = pick("diem_noi_bat", 2000);
    const highlights = highlightsRaw ? highlightsRaw.split("|").map((s) => s.trim()).filter(Boolean) : undefined;

    if (name && name.length < 2) errors.push({ line: firstLine, column: "ten_san_pham", message: "Tên sản phẩm cần ít nhất 2 ký tự." });
    if (name.length > 150) errors.push({ line: firstLine, column: "ten_san_pham", message: "Tên sản phẩm tối đa 150 ký tự." });
    if (shortDescription.length > 300) errors.push({ line: firstLine, column: "mo_ta_ngan", message: "Mô tả ngắn tối đa 300 ký tự." });
    if (description.length > 5000) errors.push({ line: firstLine, column: "mo_ta", message: "Mô tả tối đa 5.000 ký tự." });
    if (brand.length > 60) errors.push({ line: firstLine, column: "thuong_hieu", message: "Thương hiệu tối đa 60 ký tự." });
    if (highlights && (highlights.length > 10 || highlights.some((h) => h.length > 200)))
      errors.push({ line: firstLine, column: "diem_noi_bat", message: "Tối đa 10 điểm nổi bật, mỗi ý tối đa 200 ký tự." });
    if (categoryPath.length > 5 || categoryPath.some((s) => s.length > 80))
      errors.push({ line: firstLine, column: "danh_muc", message: "Đường dẫn danh mục tối đa 5 cấp, mỗi tên tối đa 80 ký tự." });

    if (!existing) {
      if (!name) errors.push({ line: firstLine, column: "ten_san_pham", message: `Sản phẩm mới ${group.code}: thiếu tên sản phẩm.` });
      if (categoryPath.length === 0) errors.push({ line: firstLine, column: "danh_muc", message: `Sản phẩm mới ${group.code}: thiếu danh mục.` });
    }

    // Thuộc tính biến thể: mọi dòng của một sản phẩm phải dùng cùng bộ tên thuộc tính.
    const rowOptions = group.rows.map(({ row, line }) => ({ line, row, ...readOptions(row, line, errors) }));
    const optionNames = rowOptions[0].names;
    for (const r of rowOptions) {
      if (r.names.join("|") !== optionNames.join("|"))
        errors.push({ line: r.line, column: "thuoc_tinh_1", message: `Tên thuộc tính khác với dòng ${firstLine} (${optionNames.join(", ") || "không có"}).` });
    }
    if (optionNames.length === 0 && group.rows.length > 1)
      errors.push({ line: group.rows[1].line, column: "thuoc_tinh_1", message: "Sản phẩm có nhiều dòng (nhiều SKU) phải có thuộc tính biến thể để phân biệt." });

    const existingOptionNames: string[] = existing ? JSON.parse(existing.option_names_json) : [];
    if (existing && [...existingOptionNames].sort().join("|") !== [...optionNames].sort().join("|")) {
      errors.push({
        line: firstLine,
        column: "thuoc_tinh_1",
        message: `Sản phẩm đã có dùng thuộc tính (${existingOptionNames.join(", ") || "không có"}), file dùng (${optionNames.join(", ") || "không có"}). Hãy sửa file hoặc sửa trong quản trị.`,
      });
    }

    // Biến thể.
    const variants: PlannedVariant[] = [];
    const existingVariants = existing ? (productVariants.all(existing.id) as ExistingVariant[]) : [];
    const keysInFile = new Map<string, number>();
    for (const { row, line, options } of rowOptions) {
      const sku = clean(row.sku, 40).toUpperCase();
      const vKey = optionsKey(options);
      if (keysInFile.has(vKey)) {
        errors.push({ line, column: "gia_tri_1", message: `Trùng thuộc tính với dòng ${keysInFile.get(vKey)} của cùng sản phẩm.` });
        continue;
      }
      keysInFile.set(vKey, line);

      const price = parseMoney(row.gia_ban);
      const compare = parseMoney(row.gia_niem_yet);
      const stock = parseCount(row.ton_kho);
      const cost = parseMoney(row.gia_nhap);
      if (Number.isNaN(price)) errors.push({ line, column: "gia_ban", message: "Giá bán phải là số nguyên VNĐ (vd. 459000 hoặc 459.000)." });
      else if (price !== null && (price < PRICE_MIN || price > PRICE_MAX))
        errors.push({ line, column: "gia_ban", message: "Giá bán phải từ 1.000 đến 10.000.000.000 ₫." });
      if (Number.isNaN(compare)) errors.push({ line, column: "gia_niem_yet", message: "Giá niêm yết phải là số nguyên VNĐ." });
      if (Number.isNaN(stock)) errors.push({ line, column: "ton_kho", message: "Tồn kho phải là số nguyên ≥ 0." });
      else if (stock !== null && stock > STOCK_MAX) errors.push({ line, column: "ton_kho", message: "Tồn kho tối đa 1.000.000." });
      if (Number.isNaN(cost)) errors.push({ line, column: "gia_nhap", message: "Giá nhập phải là số nguyên VNĐ." });

      const found = findVariant.get(sku) as ExistingVariant | undefined;
      if (found && (!existing || found.product_id !== existing.id)) {
        const owner = productOwner.get(found.product_id) as { id: string; source: string | null; source_code: string | null };
        errors.push({
          line,
          column: "sku",
          message: `SKU ${sku} đã thuộc sản phẩm khác (${owner.source ? `${owner.source}/${owner.source_code}` : `mã ${owner.id}`}).`,
        });
        continue;
      }

      const valid = (n: number | null) => n !== null && !Number.isNaN(n);
      if (!found) {
        // SKU mới: bắt buộc giá bán và tồn kho; KHÔNG tự đặt (kể cả lấy từ giá nhập).
        if (price === null) errors.push({ line, column: "gia_ban", message: `SKU mới ${sku}: thiếu giá bán. Hệ thống không tự đặt giá (kể cả từ giá nhập).` });
        if (stock === null) errors.push({ line, column: "ton_kho", message: `SKU mới ${sku}: thiếu tồn kho. Hệ thống không tự đặt tồn kho.` });
        const clash = existingVariants.find((v) => v.options_key === vKey);
        if (clash) errors.push({ line, column: "sku", message: `Tổ hợp thuộc tính này đã có SKU khác trong sản phẩm.` });
        if (valid(price) && valid(compare) && compare! <= price!)
          errors.push({ line, column: "gia_niem_yet", message: "Giá niêm yết phải lớn hơn giá bán (hoặc để trống)." });
        if (valid(price) && valid(cost) && price! < cost!)
          warnings.push({ line, column: "gia_ban", message: `Giá bán ${price} thấp hơn giá nhập ${cost}.` });
        variants.push({
          line,
          sku,
          options,
          key: vKey,
          existingId: null,
          action: "new",
          price: valid(price) ? price! : undefined,
          compareAtPrice: valid(compare) ? compare! : undefined,
          stock: valid(stock) ? stock! : undefined,
          cost: valid(cost) ? cost! : undefined,
          changes: [],
        });
        continue;
      }

      // SKU đã có trong chính sản phẩm này: chỉ cập nhật cột có giá trị; để trống = giữ nguyên.
      if (found.options_key !== vKey) {
        errors.push({ line, column: "gia_tri_1", message: `Thuộc tính của SKU ${sku} khác với hiện tại; đổi thuộc tính hãy làm trong quản trị.` });
        continue;
      }
      const finalPrice = valid(price) ? price! : found.price;
      const finalCompare = valid(compare) ? compare! : found.compare_at_price;
      if (finalCompare !== null && finalCompare <= finalPrice)
        errors.push({ line, column: "gia_niem_yet", message: "Giá niêm yết phải lớn hơn giá bán." });
      const finalCost = valid(cost) ? cost! : found.cost_price;
      if (finalCost !== null && finalPrice < finalCost)
        warnings.push({ line, column: "gia_ban", message: `Giá bán ${finalPrice} thấp hơn giá nhập ${finalCost}.` });
      const changes: string[] = [];
      if (valid(price) && price !== found.price) changes.push(`giá ${found.price} → ${price}`);
      if (valid(compare) && compare !== found.compare_at_price) changes.push(`giá niêm yết ${found.compare_at_price ?? "—"} → ${compare}`);
      if (valid(stock) && stock !== found.stock) changes.push(`tồn kho ${found.stock} → ${stock}`);
      if (valid(cost) && cost !== found.cost_price) changes.push("giá nhập");
      variants.push({
        line,
        sku,
        options,
        key: vKey,
        existingId: found.id,
        action: changes.length ? "update" : "unchanged",
        price: valid(price) && price !== found.price ? price! : undefined,
        compareAtPrice: valid(compare) && compare !== found.compare_at_price ? compare! : undefined,
        stock: valid(stock) && stock !== found.stock ? stock! : undefined,
        cost: valid(cost) && cost !== found.cost_price ? cost! : undefined,
        changes,
      });
    }

    if (existing && existingVariants.length > 0) {
      const inFile = new Set(variants.map((v) => v.existingId).filter(Boolean));
      const missing = existingVariants.filter((v) => !inFile.has(v.id)).length;
      if (missing) warnings.push({ line: firstLine, message: `${group.code}: ${missing} phiên bản hiện có không nằm trong file, được giữ nguyên.` });
    }

    // Danh mục.
    let category: CategoryRef | undefined;
    let categoryLabel: string | undefined;
    let icon = "shopping-bag";
    if (categoryPath.length && categoryPath.length <= 5) {
      const resolved = categories.resolve(categoryPath);
      icon = resolved.icon;
      categoryLabel = categoryPath.join(" > ");
      if (!existing || !("id" in resolved.ref) || resolved.ref.id !== existing.category_id) category = resolved.ref;
    }

    // Ảnh: bỏ URL đã tải trước đây cho sản phẩm này, giới hạn số ảnh.
    const urlSet: string[] = [];
    for (const { row, line } of group.rows) {
      for (const url of parseImageUrls(row.anh, line, errors)) if (!urlSet.includes(url)) urlSet.push(url);
    }
    let imageUrls = urlSet;
    if (existing) {
      const have = new Set((existingImageUrls.all(existing.id) as { source_url: string }[]).map((r) => r.source_url));
      imageUrls = urlSet.filter((u) => !have.has(u));
    }
    const room = MAX_IMAGES_PER_PRODUCT - (existing ? (imageCount.get(existing.id) as { n: number }).n : 0);
    if (imageUrls.length > room) {
      warnings.push({ line: firstLine, column: "anh", message: `${group.code}: chỉ tải thêm ${Math.max(0, room)} ảnh (tối đa ${MAX_IMAGES_PER_PRODUCT} ảnh/sản phẩm).` });
      imageUrls = imageUrls.slice(0, Math.max(0, room));
    }

    // Thay đổi cấp sản phẩm (chỉ cột có giá trị).
    const changes: string[] = [];
    let slug: string | undefined;
    if (existing) {
      if (name && name !== existing.name) changes.push("tên");
      if (brand && brand !== existing.brand) changes.push("thương hiệu");
      if (shortDescription && shortDescription !== existing.short_description) changes.push("mô tả ngắn");
      if (description && description !== existing.description) changes.push("mô tả");
      if (highlights && JSON.stringify(highlights) !== existing.highlights_json) changes.push("điểm nổi bật");
      if (category) changes.push("danh mục");
    } else if (errors.length === errorCountBefore) {
      const base = slugify(name) || slugify(group.code) || "san-pham";
      slug = uniqueSlug(base, (s) => usedSlugs.has(s));
      usedSlugs.add(slug);
    }

    const variantChanged = variants.some((v) => v.action !== "unchanged");
    products.push({
      key,
      source: group.source,
      code: group.code,
      firstLine,
      existingId: existing?.id ?? null,
      action: !existing ? "new" : changes.length || variantChanged || imageUrls.length ? "update" : "unchanged",
      name: existing ? (name && name !== existing.name ? name : undefined) : name,
      slug,
      category,
      categoryLabel,
      placeholderIcon: icon,
      brand: existing ? (brand && brand !== existing.brand ? brand : undefined) : brand,
      shortDescription: existing ? (shortDescription && shortDescription !== existing.short_description ? shortDescription : undefined) : shortDescription,
      description: existing ? (description && description !== existing.description ? description : undefined) : description,
      highlights: existing ? (highlights && JSON.stringify(highlights) !== existing.highlights_json ? highlights : undefined) : (highlights ?? []),
      optionNames,
      variants,
      imageUrls,
      changes,
    });
  }

  errors.sort((a, b) => a.line - b.line);
  warnings.sort((a, b) => a.line - b.line);
  const allVariants = products.flatMap((p) => p.variants);
  return {
    products,
    categories: [...categories.planned.values()],
    errors,
    warnings,
    stats: {
      rows: rows.length,
      productsNew: products.filter((p) => p.action === "new").length,
      productsUpdate: products.filter((p) => p.action === "update").length,
      productsUnchanged: products.filter((p) => p.action === "unchanged").length,
      variantsNew: allVariants.filter((v) => v.action === "new").length,
      variantsUpdate: allVariants.filter((v) => v.action === "update").length,
      variantsUnchanged: allVariants.filter((v) => v.action === "unchanged").length,
      categoriesNew: categories.planned.size,
      imagesToDownload: products.reduce((s, p) => s + p.imageUrls.length, 0),
      errors: errors.length,
      warnings: warnings.length,
    },
  };
}
