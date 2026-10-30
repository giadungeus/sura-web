import "server-only";
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ICON_KEYS } from "@/components/icons";
import { optionsKey } from "@/lib/cart-key";
import { imageUrl } from "@/lib/data/catalog";
import { SKU_PATTERN, SLUG_MAX_LENGTH, SLUG_PATTERN } from "@/lib/slug";
import { productSearchText } from "@/lib/server/catalog-seed";
import { getDb, withTransaction } from "@/lib/server/db";
import { MAX_IMAGES_PER_PRODUCT } from "@/lib/server/images";
import type { IconKey, SelectedOptions } from "@/types";

export const ADMIN_PRODUCT_PAGE_SIZE = 20;
export const PRICE_MIN = 1_000;
export const PRICE_MAX = 10_000_000_000;
export const STOCK_MAX = 1_000_000;
export const MAX_VARIANTS = 100;
export const MAX_OPTION_GROUPS = 3;

export type FieldErrors = Record<string, string>;
export type SaveResult<T = undefined> =
  | { ok: true; message: string; value: T }
  | { ok: false; message: string; fieldErrors?: FieldErrors };

const now = () => new Date().toISOString();

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max + 1);
}

function multiline(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max + 1);
}

/** Số nguyên an toàn trong khoảng; chấp nhận chuỗi "1.290.000" hoặc "1290000". */
function parseInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[.\s,_]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : null;
}

// ═════════════════════════ DANH MỤC ═════════════════════════

export type AdminCategory = {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: IconKey;
  parentId: number | null;
  parentName: string | null;
  sortOrder: number;
  isVisible: boolean;
  productCount: number;
  childCount: number;
  depth: number;
};

/** Danh mục theo dạng cây (cha trước, con ngay sau), kèm số sản phẩm và danh mục con. */
export function listAdminCategories(): AdminCategory[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count,
              (SELECT COUNT(*) FROM categories k WHERE k.parent_id = c.id) AS child_count
       FROM categories c ORDER BY c.sort_order, c.id`,
    )
    .all() as {
    id: number;
    slug: string;
    name: string;
    description: string;
    icon: string;
    parent_id: number | null;
    sort_order: number;
    is_visible: number;
    product_count: number;
    child_count: number;
  }[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const result: AdminCategory[] = [];
  const visit = (parentId: number | null, depth: number) => {
    for (const r of rows.filter((x) => x.parent_id === parentId)) {
      result.push({
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        icon: r.icon as IconKey,
        parentId: r.parent_id,
        parentName: r.parent_id ? (byId.get(r.parent_id)?.name ?? null) : null,
        sortOrder: r.sort_order,
        isVisible: r.is_visible === 1,
        productCount: r.product_count,
        childCount: r.child_count,
        depth,
      });
      if (depth < 5) visit(r.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

export function getAdminCategory(id: number): AdminCategory | null {
  return listAdminCategories().find((c) => c.id === id) ?? null;
}

export type CategoryInput = {
  name: string;
  slug: string;
  description: string;
  icon: IconKey;
  parentId: number | null;
  sortOrder: number;
  isVisible: boolean;
};

export function saveCategory(id: number | null, raw: Record<string, unknown>): SaveResult<{ id: number }> {
  const errors: FieldErrors = {};
  const name = text(raw.name, 80);
  const slug = text(raw.slug, SLUG_MAX_LENGTH).toLowerCase();
  const description = text(raw.description, 300);
  const icon = String(raw.icon ?? "");
  const parentRaw = String(raw.parentId ?? "");
  const parentId = parentRaw === "" ? null : parseInteger(parentRaw);
  const sortRaw = String(raw.sortOrder ?? "0").trim() || "0";
  const sortOrder = /^-?\d{1,5}$/.test(sortRaw) ? Number(sortRaw) : null;
  const isVisible = raw.isVisible === "1" || raw.isVisible === "on" || raw.isVisible === true;

  if (name.length < 2) errors.name = "Tên danh mục cần ít nhất 2 ký tự.";
  else if (name.length > 80) errors.name = "Tên danh mục tối đa 80 ký tự.";
  if (!slug) errors.slug = "Vui lòng nhập slug.";
  else if (slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(slug))
    errors.slug = "Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang (vd. dien-thoai).";
  if (description.length > 300) errors.description = "Mô tả tối đa 300 ký tự.";
  if (!(ICON_KEYS as string[]).includes(icon)) errors.icon = "Biểu tượng không hợp lệ.";
  if (sortOrder === null) errors.sortOrder = "Thứ tự là số nguyên (vd. 0, 10, 20).";
  if (parentRaw !== "" && parentId === null) errors.parentId = "Danh mục cha không hợp lệ.";

  const db = getDb();
  if (!errors.slug) {
    const taken = db.prepare("SELECT id FROM categories WHERE slug = ?").get(slug) as { id: number } | undefined;
    if (taken && taken.id !== id) errors.slug = "Slug này đã được dùng cho danh mục khác.";
  }
  if (parentId !== null && !errors.parentId) {
    if (!db.prepare("SELECT 1 FROM categories WHERE id = ?").get(parentId)) errors.parentId = "Danh mục cha không tồn tại.";
    else if (id !== null) {
      // Không cho chọn chính nó hoặc danh mục con cháu làm cha (tránh vòng lặp).
      let current: number | null = parentId;
      for (let i = 0; current !== null && i < 20; i++) {
        if (current === id) {
          errors.parentId = "Không thể chọn chính danh mục này hoặc danh mục con của nó làm cha.";
          break;
        }
        current = (db.prepare("SELECT parent_id FROM categories WHERE id = ?").get(current) as { parent_id: number | null })
          .parent_id;
      }
    }
  }
  if (Object.keys(errors).length) return { ok: false, message: "Vui lòng kiểm tra lại thông tin.", fieldErrors: errors };

  return withTransaction((tx) => {
    const t = now();
    if (id === null) {
      const r = tx
        .prepare(
          `INSERT INTO categories (slug, name, description, icon, parent_id, sort_order, is_visible, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(slug, name, description, icon, parentId, sortOrder!, isVisible ? 1 : 0, t, t);
      return { ok: true as const, message: `Đã thêm danh mục “${name}”.`, value: { id: Number(r.lastInsertRowid) } };
    }
    const r = tx
      .prepare(
        `UPDATE categories SET slug = ?, name = ?, description = ?, icon = ?, parent_id = ?, sort_order = ?,
                is_visible = ?, updated_at = ? WHERE id = ?`,
      )
      .run(slug, name, description, icon, parentId, sortOrder!, isVisible ? 1 : 0, t, id);
    if (!r.changes) return { ok: false as const, message: "Không tìm thấy danh mục." };
    return { ok: true as const, message: `Đã lưu danh mục “${name}”.`, value: { id } };
  });
}

export function setCategoryVisibility(id: number, visible: boolean): SaveResult {
  const r = getDb()
    .prepare("UPDATE categories SET is_visible = ?, updated_at = ? WHERE id = ?")
    .run(visible ? 1 : 0, now(), id);
  if (!r.changes) return { ok: false, message: "Không tìm thấy danh mục." };
  return { ok: true, message: visible ? "Đã hiện danh mục." : "Đã ẩn danh mục.", value: undefined };
}

/** Chỉ xoá được danh mục không còn sản phẩm và không còn danh mục con. */
export function deleteCategory(id: number): SaveResult {
  return withTransaction((db) => {
    const c = db.prepare("SELECT name FROM categories WHERE id = ?").get(id) as { name: string } | undefined;
    if (!c) return { ok: false as const, message: "Không tìm thấy danh mục." };
    const products = (db.prepare("SELECT COUNT(*) n FROM products WHERE category_id = ?").get(id) as { n: number }).n;
    if (products > 0)
      return {
        ok: false as const,
        message: `Không thể xoá “${c.name}” vì đang chứa ${products} sản phẩm. Hãy chuyển sản phẩm sang danh mục khác hoặc ẩn danh mục.`,
      };
    const children = (db.prepare("SELECT COUNT(*) n FROM categories WHERE parent_id = ?").get(id) as { n: number }).n;
    if (children > 0)
      return { ok: false as const, message: `Không thể xoá “${c.name}” vì còn ${children} danh mục con.` };
    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
    return { ok: true as const, message: `Đã xoá danh mục “${c.name}”.`, value: undefined };
  });
}

// ═════════════════════════ SẢN PHẨM ═════════════════════════

export type ProductStatusFilter = "hien" | "an" | "het-hang";

export type AdminProductListItem = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  categoryName: string;
  isVisible: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  totalStock: number;
  variantCount: number;
  imageUrl: string | null;
  updatedAt: string;
};

export function listAdminProducts(query: {
  q?: string;
  categoryId?: number;
  status?: ProductStatusFilter;
  page?: number;
}): { items: AdminProductListItem[]; total: number; page: number; totalPages: number } {
  const db = getDb();
  const where: string[] = [];
  const params: (string | number)[] = [];
  const q = query.q?.trim().slice(0, 60);
  if (q) {
    const norm = q
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/-/g, " ") // cho phép tìm bằng slug (ao-thun → ao thun)
      .replace(/\s+/g, " ")
      .trim();
    where.push(
      `(p.search_text LIKE ? OR p.id = ? OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 AND v.sku LIKE ?))`,
    );
    params.push(`%${norm}%`, q, `%${q}%`);
  }
  if (query.categoryId) {
    // Gồm cả danh mục con.
    where.push(
      `p.category_id IN (WITH RECURSIVE t(id) AS (SELECT ? UNION ALL SELECT c.id FROM categories c JOIN t ON c.parent_id = t.id) SELECT id FROM t)`,
    );
    params.push(query.categoryId);
  }
  if (query.status === "hien") where.push("p.is_visible = 1");
  if (query.status === "an") where.push("p.is_visible = 0");
  if (query.status === "het-hang")
    where.push("COALESCE((SELECT SUM(stock) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1), 0) = 0");
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = (db.prepare(`SELECT COUNT(*) n FROM products p ${whereSql}`).get(...params) as { n: number }).n;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PRODUCT_PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page ?? 1), totalPages);

  const rows = db
    .prepare(
      `SELECT p.id, p.slug, p.name, p.brand, p.is_visible, p.updated_at, c.name AS category_name,
              (SELECT MIN(price) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS min_price,
              (SELECT MAX(price) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS max_price,
              (SELECT COALESCE(SUM(stock), 0) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS total_stock,
              (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variant_count,
              (SELECT file_name FROM product_images i WHERE i.product_id = p.id ORDER BY is_primary DESC, position, id LIMIT 1) AS image_file
       FROM products p JOIN categories c ON c.id = p.category_id
       ${whereSql}
       ORDER BY p.updated_at DESC, p.id
       LIMIT ? OFFSET ?`,
    )
    .all(...params, ADMIN_PRODUCT_PAGE_SIZE, (page - 1) * ADMIN_PRODUCT_PAGE_SIZE) as {
    id: string;
    slug: string;
    name: string;
    brand: string;
    is_visible: number;
    updated_at: string;
    category_name: string;
    min_price: number | null;
    max_price: number | null;
    total_stock: number;
    variant_count: number;
    image_file: string | null;
  }[];

  return {
    total,
    page,
    totalPages,
    items: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      brand: r.brand,
      categoryName: r.category_name,
      isVisible: r.is_visible === 1,
      minPrice: r.min_price,
      maxPrice: r.max_price,
      totalStock: r.total_stock,
      variantCount: r.variant_count,
      imageUrl: r.image_file ? imageUrl(r.image_file) : null,
      updatedAt: r.updated_at,
    })),
  };
}

export type AdminVariant = {
  id: number;
  sku: string;
  options: SelectedOptions;
  price: number;
  compareAtPrice: number | null;
  stock: number;
};

export type AdminImage = { id: number; url: string; width: number; height: number };

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  categoryId: number;
  shortDescription: string;
  description: string;
  highlights: string[];
  isVisible: boolean;
  optionNames: string[];
  variants: AdminVariant[];
  images: AdminImage[];
  primaryImageId: number | null;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
};

export function getAdminProduct(id: string): AdminProduct | null {
  const db = getDb();
  const p = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as
    | {
        id: string;
        slug: string;
        name: string;
        brand: string;
        category_id: number;
        short_description: string;
        description: string;
        highlights_json: string;
        is_visible: number;
        option_names_json: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!p) return null;
  const variants = db
    .prepare(
      `SELECT id, sku, options_json, price, compare_at_price, stock FROM product_variants
       WHERE product_id = ? AND is_active = 1 ORDER BY position, id`,
    )
    .all(id) as { id: number; sku: string; options_json: string; price: number; compare_at_price: number | null; stock: number }[];
  const images = db
    .prepare(
      `SELECT id, file_name, width, height, is_primary FROM product_images
       WHERE product_id = ? ORDER BY is_primary DESC, position, id`,
    )
    .all(id) as { id: number; file_name: string; width: number; height: number; is_primary: number }[];
  const orderCount = (
    db.prepare("SELECT COUNT(DISTINCT order_id) n FROM order_items WHERE product_id = ?").get(id) as { n: number }
  ).n;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    categoryId: p.category_id,
    shortDescription: p.short_description,
    description: p.description,
    highlights: JSON.parse(p.highlights_json) as string[],
    isVisible: p.is_visible === 1,
    optionNames: JSON.parse(p.option_names_json) as string[],
    variants: variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      options: JSON.parse(v.options_json) as SelectedOptions,
      price: v.price,
      compareAtPrice: v.compare_at_price,
      stock: v.stock,
    })),
    images: images.map((i) => ({ id: i.id, url: imageUrl(i.file_name), width: i.width, height: i.height })),
    primaryImageId: images.find((i) => i.is_primary)?.id ?? images[0]?.id ?? null,
    orderCount,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

type ValidVariant = {
  id: number | null;
  sku: string;
  options: SelectedOptions;
  key: string;
  price: number;
  compareAtPrice: number | null;
  stock: number;
};

/**
 * Tạo hoặc cập nhật sản phẩm từ dữ liệu form (JSON). Mọi giá trị đều được kiểm tra lại
 * ở đây; giá, tồn kho, SKU, slug, ảnh, biến thể đều có ràng buộc.
 */
export function saveProduct(productId: string | null, raw: unknown, adminUsername: string): SaveResult<{ id: string }> {
  void adminUsername;
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};
  const db = getDb();

  const name = text(input.name, 150);
  const slug = text(input.slug, SLUG_MAX_LENGTH).toLowerCase();
  const brand = text(input.brand, 60);
  const shortDescription = text(input.shortDescription, 300);
  const description = multiline(input.description, 5000);
  const highlights = multiline(input.highlights, 2000)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const categoryId = parseInteger(String(input.categoryId ?? ""));
  const isVisible = input.isVisible === true;
  const hasVariants = input.hasVariants === true;

  if (name.length < 2) errors.name = "Tên sản phẩm cần ít nhất 2 ký tự.";
  else if (name.length > 150) errors.name = "Tên sản phẩm tối đa 150 ký tự.";
  if (!slug) errors.slug = "Vui lòng nhập slug.";
  else if (slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(slug))
    errors.slug = "Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang.";
  else {
    const taken = db.prepare("SELECT id FROM products WHERE slug = ?").get(slug) as { id: string } | undefined;
    if (taken && taken.id !== productId) errors.slug = "Slug này đã được dùng cho sản phẩm khác.";
  }
  if (brand.length > 60) errors.brand = "Thương hiệu tối đa 60 ký tự.";
  if (shortDescription.length > 300) errors.shortDescription = "Mô tả ngắn tối đa 300 ký tự.";
  if (description.length > 5000) errors.description = "Mô tả tối đa 5.000 ký tự.";
  if (highlights.length > 10 || highlights.some((h) => h.length > 200))
    errors.highlights = "Tối đa 10 điểm nổi bật, mỗi dòng tối đa 200 ký tự.";
  if (categoryId === null || !db.prepare("SELECT 1 FROM categories WHERE id = ?").get(categoryId))
    errors.categoryId = "Vui lòng chọn danh mục.";

  // ── Thuộc tính biến thể ──
  let optionNames: string[] = [];
  if (hasVariants) {
    optionNames = (Array.isArray(input.optionNames) ? input.optionNames : []).map((n) => text(n, 30)).filter(Boolean);
    if (optionNames.length === 0) errors.optionNames = "Nhập ít nhất một thuộc tính (vd. Màu sắc, Size).";
    else if (optionNames.length > MAX_OPTION_GROUPS) errors.optionNames = `Tối đa ${MAX_OPTION_GROUPS} thuộc tính.`;
    else if (new Set(optionNames.map((n) => n.toLowerCase())).size !== optionNames.length)
      errors.optionNames = "Tên thuộc tính bị trùng.";
    else if (optionNames.some((n) => n.length > 30)) errors.optionNames = "Tên thuộc tính tối đa 30 ký tự.";
  }

  // ── Biến thể: SKU, thuộc tính, giá, tồn kho ──
  const rawVariants = Array.isArray(input.variants) ? input.variants : [];
  const variants: ValidVariant[] = [];
  if (rawVariants.length === 0) errors.variants = "Cần ít nhất một phiên bản có giá và tồn kho.";
  else if (!hasVariants && rawVariants.length !== 1) errors.variants = "Sản phẩm không biến thể chỉ có một dòng giá/tồn kho.";
  else if (rawVariants.length > MAX_VARIANTS) errors.variants = `Tối đa ${MAX_VARIANTS} biến thể.`;
  else {
    const seenSku = new Set<string>();
    const seenKey = new Set<string>();
    rawVariants.forEach((rv, i) => {
      const v = (typeof rv === "object" && rv !== null ? rv : {}) as Record<string, unknown>;
      const row = `variants.${i}`;
      const idRaw = v.id === null || v.id === undefined || v.id === "" ? null : parseInteger(String(v.id));
      const sku = text(v.sku, 40).toUpperCase();
      const price = parseInteger(v.price);
      const compareRaw = v.compareAtPrice;
      const compareAtPrice = compareRaw === null || compareRaw === undefined || compareRaw === "" ? null : parseInteger(compareRaw);
      const stock = parseInteger(v.stock);
      const options: SelectedOptions = {};
      if (hasVariants && !errors.optionNames) {
        const rawOptions = (typeof v.options === "object" && v.options !== null ? v.options : {}) as Record<string, unknown>;
        for (const optName of optionNames) {
          const value = text(rawOptions[optName], 40);
          if (!value) errors[`${row}.options`] = `Dòng ${i + 1}: nhập đủ giá trị cho mọi thuộc tính.`;
          else if (value.length > 40) errors[`${row}.options`] = `Dòng ${i + 1}: giá trị thuộc tính tối đa 40 ký tự.`;
          options[optName] = value;
        }
      }
      if (!SKU_PATTERN.test(sku))
        errors[`${row}.sku`] = `Dòng ${i + 1}: SKU gồm 2–40 ký tự in hoa, số, “-” hoặc “_”.`;
      else if (seenSku.has(sku)) errors[`${row}.sku`] = `Dòng ${i + 1}: SKU bị trùng trong sản phẩm.`;
      seenSku.add(sku);
      if (price === null || price < PRICE_MIN || price > PRICE_MAX)
        errors[`${row}.price`] = `Dòng ${i + 1}: giá bán là số nguyên từ 1.000 đến 10.000.000.000 ₫.`;
      if (compareAtPrice !== null && (compareAtPrice > PRICE_MAX || price === null || compareAtPrice <= price))
        errors[`${row}.compareAtPrice`] = `Dòng ${i + 1}: giá niêm yết phải lớn hơn giá bán (hoặc để trống).`;
      if (stock === null || stock < 0 || stock > STOCK_MAX)
        errors[`${row}.stock`] = `Dòng ${i + 1}: tồn kho là số nguyên từ 0 đến 1.000.000.`;
      const key = optionsKey(options);
      if (hasVariants && !errors[`${row}.options`]) {
        if (seenKey.has(key)) errors[`${row}.options`] = `Dòng ${i + 1}: trùng thuộc tính với dòng khác.`;
        seenKey.add(key);
      }
      variants.push({ id: idRaw, sku, options, key, price: price ?? 0, compareAtPrice, stock: stock ?? 0 });
    });
  }

  // SKU không được trùng với sản phẩm khác.
  if (!Object.keys(errors).some((k) => k.endsWith(".sku"))) {
    const check = db.prepare("SELECT product_id FROM product_variants WHERE sku = ? COLLATE NOCASE");
    variants.forEach((v, i) => {
      const owner = check.get(v.sku) as { product_id: string } | undefined;
      if (owner && owner.product_id !== productId) errors[`variants.${i}.sku`] = `Dòng ${i + 1}: SKU “${v.sku}” đã thuộc sản phẩm khác.`;
    });
  }

  // ── Ảnh ──
  const imageIds = (Array.isArray(input.imageIds) ? input.imageIds : [])
    .map((x) => parseInteger(x))
    .filter((x): x is number => x !== null);
  if (imageIds.length > MAX_IMAGES_PER_PRODUCT) errors.images = `Tối đa ${MAX_IMAGES_PER_PRODUCT} ảnh.`;
  if (new Set(imageIds).size !== imageIds.length) errors.images = "Danh sách ảnh bị trùng.";
  if (!errors.images) {
    const check = db.prepare("SELECT product_id FROM product_images WHERE id = ?");
    for (const imgId of imageIds) {
      const row = check.get(imgId) as { product_id: string | null } | undefined;
      // Chỉ nhận ảnh vừa tải lên (chưa gắn) hoặc ảnh đang thuộc chính sản phẩm này.
      if (!row || (row.product_id !== null && row.product_id !== productId)) {
        errors.images = "Có ảnh không hợp lệ, vui lòng tải lại trang.";
        break;
      }
    }
  }
  const primaryRaw = parseInteger(input.primaryImageId);
  const primaryImageId = primaryRaw !== null && imageIds.includes(primaryRaw) ? primaryRaw : (imageIds[0] ?? null);

  if (productId !== null && !db.prepare("SELECT 1 FROM products WHERE id = ?").get(productId)) {
    return { ok: false, message: "Không tìm thấy sản phẩm." };
  }
  if (Object.keys(errors).length) {
    return { ok: false, message: "Vui lòng kiểm tra lại các ô được đánh dấu.", fieldErrors: errors };
  }

  return withTransaction((tx) => {
    const t = now();
    const searchText = productSearchText(name, brand, slug);
    let id = productId;
    if (id === null) {
      id = `sp-${randomBytes(4).toString("hex")}`;
      const icon = (tx.prepare("SELECT icon FROM categories WHERE id = ?").get(categoryId!) as { icon: string }).icon;
      tx.prepare(
        `INSERT INTO products (id, slug, name, brand, category_id, short_description, description, highlights_json,
                               option_names_json, placeholder_tone, placeholder_icon, is_visible, search_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'slate', ?, ?, ?, ?, ?)`,
      ).run(
        id,
        slug,
        name,
        brand,
        categoryId!,
        shortDescription,
        description,
        JSON.stringify(highlights),
        JSON.stringify(optionNames),
        icon,
        isVisible ? 1 : 0,
        searchText,
        t,
        t,
      );
    } else {
      tx.prepare(
        `UPDATE products SET slug = ?, name = ?, brand = ?, category_id = ?, short_description = ?, description = ?,
                highlights_json = ?, option_names_json = ?, is_visible = ?, search_text = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        slug,
        name,
        brand,
        categoryId!,
        shortDescription,
        description,
        JSON.stringify(highlights),
        JSON.stringify(optionNames),
        isVisible ? 1 : 0,
        searchText,
        t,
        id,
      );
    }

    const variantError = writeVariants(tx, id, variants);
    if (variantError) throw new VariantWriteError(variantError);
    writeImages(tx, id, imageIds, primaryImageId);

    return { ok: true as const, message: productId ? `Đã lưu “${name}”.` : `Đã thêm sản phẩm “${name}”.`, value: { id } };
  });
}

export class VariantWriteError extends Error {}

/**
 * Ghi biến thể. Biến thể bị bỏ khỏi form: nếu đã có trong đơn hàng thì chỉ ẩn
 * (giữ để hoàn kho khi huỷ đơn), nếu chưa thì xoá hẳn.
 */
function writeVariants(db: DatabaseSync, productId: string, variants: ValidVariant[]): string | null {
  const existing = db
    .prepare("SELECT id FROM product_variants WHERE product_id = ? AND is_active = 1")
    .all(productId) as { id: number }[];
  const existingIds = new Set(existing.map((e) => e.id));
  for (const v of variants) {
    if (v.id !== null && !existingIds.has(v.id)) return "Biến thể không thuộc sản phẩm này, vui lòng tải lại trang.";
  }
  const keepIds = new Set(variants.filter((v) => v.id !== null).map((v) => v.id!));
  const used = db.prepare("SELECT 1 FROM order_items WHERE variant_id = ? LIMIT 1");

  for (const e of existing) {
    if (keepIds.has(e.id)) continue;
    if (used.get(e.id)) {
      // Đổi SKU/khoá thành giá trị riêng để có thể tạo lại biến thể cùng SKU/thuộc tính.
      db.prepare(
        "UPDATE product_variants SET is_active = 0, sku = sku || '~' || id, options_key = '#' || id WHERE id = ?",
      ).run(e.id);
    } else {
      db.prepare("DELETE FROM product_variants WHERE id = ?").run(e.id);
    }
  }
  // Đặt tạm giá trị duy nhất trước khi cập nhật để tránh xung đột khi hoán đổi SKU/thuộc tính giữa các dòng.
  for (const id of keepIds) {
    db.prepare("UPDATE product_variants SET sku = '~tmp~' || id, options_key = '~tmp~' || id WHERE id = ?").run(id);
  }
  const update = db.prepare(
    `UPDATE product_variants SET sku = ?, options_json = ?, options_key = ?, price = ?, compare_at_price = ?, stock = ?, position = ?
     WHERE id = ? AND product_id = ?`,
  );
  const insert = db.prepare(
    `INSERT INTO product_variants (product_id, sku, options_json, options_key, price, compare_at_price, stock, position, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  );
  variants.forEach((v, position) => {
    if (v.id !== null) {
      update.run(v.sku, JSON.stringify(v.options), v.key, v.price, v.compareAtPrice, v.stock, position, v.id, productId);
    } else {
      insert.run(productId, v.sku, JSON.stringify(v.options), v.key, v.price, v.compareAtPrice, v.stock, position);
    }
  });
  return null;
}

function writeImages(db: DatabaseSync, productId: string, imageIds: number[], primaryId: number | null) {
  // Ảnh bị bỏ ra khỏi sản phẩm: gỡ liên kết (tệp vẫn giữ để ảnh trong đơn cũ không bị mất).
  const current = db.prepare("SELECT id FROM product_images WHERE product_id = ?").all(productId) as { id: number }[];
  const unlink = db.prepare("UPDATE product_images SET product_id = NULL, is_primary = 0 WHERE id = ?");
  for (const c of current) if (!imageIds.includes(c.id)) unlink.run(c.id);
  const attach = db.prepare("UPDATE product_images SET product_id = ?, position = ?, is_primary = ? WHERE id = ?");
  imageIds.forEach((imgId, position) => attach.run(productId, position, imgId === primaryId ? 1 : 0, imgId));
}

export function setProductVisibility(id: string, visible: boolean): SaveResult {
  const r = getDb()
    .prepare("UPDATE products SET is_visible = ?, updated_at = ? WHERE id = ?")
    .run(visible ? 1 : 0, now(), id);
  if (!r.changes) return { ok: false, message: "Không tìm thấy sản phẩm." };
  return { ok: true, message: visible ? "Đã hiện sản phẩm trên cửa hàng." : "Đã ẩn sản phẩm khỏi cửa hàng.", value: undefined };
}

export function recordUploadedImage(img: { fileName: string; width: number; height: number; sizeBytes: number }, adminUsername: string): AdminImage {
  const r = getDb()
    .prepare(
      `INSERT INTO product_images (product_id, file_name, width, height, size_bytes, uploaded_by, created_at)
       VALUES (NULL, ?, ?, ?, ?, ?, ?)`,
    )
    .run(img.fileName, img.width, img.height, img.sizeBytes, adminUsername, now());
  return { id: Number(r.lastInsertRowid), url: imageUrl(img.fileName), width: img.width, height: img.height };
}
