/**
 * Kiểm tra gói nội dung (goi.json + bài viết + tham chiếu ảnh) theo docs/goi-noi-dung/DINH-DANG.md.
 * Không ghi gì; trả về các mục đã chuẩn hoá cùng lỗi/cảnh báo theo từng mục.
 */
import "server-only";
import { createHash } from "node:crypto";
import { IMAGE_LINE } from "@/lib/content/markup";
import { CONTENT_BODY_MAX, CONTENT_TITLE_MAX, CONTENT_PAGES } from "@/lib/content/pages";
import { SLUG_MAX_LENGTH, SLUG_PATTERN, slugify } from "@/lib/slug";
import {
  MAX_OPTION_GROUPS,
  MAX_VARIANTS,
  OPTION_NAME_MAX,
  OPTION_VALUE_MAX,
  checkNewProductFields,
  checkVariantFields,
} from "@/lib/server/admin-catalog";
import { optionsKey } from "@/lib/cart-key";
import { decodeText } from "@/lib/server/package/zip";
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, normalizeSeoText } from "@/lib/seo-text";
import { MAX_VIDEOS_PER_PRODUCT, VIDEO_TITLE_MAX, parseVideoUrl, type VideoOrientation, type VideoPlatform } from "@/lib/product-video";

export const PACKAGE_FORMAT = "sura-goi-noi-dung";
export const PACKAGE_VERSION = 1;
export const MAX_ITEMS = 30;
export const SUMMARY_MAX = 300;
export const PRODUCT_BODY_MAX = 20_000;
export const PRODUCT_GALLERY_MAX = 10;
const ALT_MAX = 200;

export type ImgRef = { path: string; alt: string };
/** Video sản phẩm trong gói (chuẩn hoá bằng bộ phân tích link dùng chung với quản trị). cover: ảnh bìa trong anh/ (tuỳ chọn). */
export type PkgVideo = {
  title: string;
  url: string;
  platform: VideoPlatform;
  videoId: string;
  orientation: VideoOrientation;
  cover: string | null;
};
/**
 * SEO trong gói: khoá vắng mặt → undefined (giữ giá trị đang lưu); chuỗi có nội dung → đặt mới;
 * chuỗi rỗng/chỉ khoảng trắng → null (xoá, quay về mặc định). Sai kiểu (kể cả null) là lỗi.
 * Lượt nhập lưu trước khi có SEO không có trường này → coi như giữ nguyên.
 */
export type SeoPatch = { title?: string | null; description?: string | null };
type Base = { index: number; label: string; bodyPath: string; body: string; inline: string[]; seo?: SeoPatch };
export type PkgItem =
  | (Base & {
      kind: "san_pham";
      productId: string;
      name: string | null;
      summary: string | null;
      cover: ImgRef | null;
      gallery: ImgRef[];
      /** Khoá "video_san_pham" vắng mặt → undefined: giữ nguyên video hiện có (gói cũ, lượt nhập lưu trước đây). */
      videos?: PkgVideo[];
      /** Có khi sản phẩm CHƯA tồn tại: tạo mới trong “Danh mục chờ” (productId = "new:<slug>"). */
      create?: NewProduct;
      /** Sản phẩm đã có + "bien_the": biến thể đối chiếu theo SKU (thêm / cập nhật / giữ nguyên). */
      variants?: PkgVariants;
    })
  | (Base & { kind: "tin_tuc"; slug: string; title: string; summary: string; cover: ImgRef | null })
  | (Base & { kind: "trang"; slug: string; title: string })
  /**
   * Danh mục ĐÃ CÓ (theo slug). Trường vắng mặt → giữ nguyên: summary undefined, bodyGiven false, seo.* undefined.
   * Chuỗi rỗng → xoá (mô tả ngắn / nội dung chi tiết rỗng; SEO về mặc định).
   */
  | (Base & { kind: "danh_muc"; slug: string; categoryId: number; summary?: string; bodyGiven: boolean });

/**
 * Sản phẩm mới từ gói. variant null = gói chưa có giá/tồn kho/SKU → tạo sản phẩm chưa có phiên bản, quản trị bổ sung
 * (KHÔNG tự điền giá hay tồn kho). missing: các trường bắt buộc còn thiếu để công khai.
 */
export type NewProduct = {
  slug: string;
  name: string;
  brand: string;
  source: string | null;
  code: string | null;
  /** Biến thể từ gói (bộ cũ sku/gia_ban/ton_kho → 1 biến thể không thuộc tính). null = chưa có giá/tồn kho. */
  variants: PkgVariants | null;
  missing: string[];
};

/** Một biến thể trong gói. options: { "Chiều dài": "0,25 m", "Màu sắc": "Đen" }; key: khoá chuẩn của bộ thuộc tính (như form). */
export type PkgVariant = { sku: string; price: number; compareAtPrice: number | null; stock: number; options: Record<string, string>; key: string };
/** optionNames rỗng = sản phẩm không biến thể (đúng 1 dòng giá/tồn kho). */
export type PkgVariants = { optionNames: string[]; list: PkgVariant[] };
/** Mã tạm của sản phẩm mới trong gói (không trùng mã thật: mã thật không có dấu “:”). */
export const NEW_PRODUCT_PREFIX = "new:";
/** Khoá chỉ dùng khi TẠO sản phẩm mới; với sản phẩm đã có thì bỏ qua (gói không đổi giá/tồn kho/SKU/thương hiệu). */
const CREATE_ONLY_KEYS = ["thuong_hieu", "sku", "gia_ban", "gia_niem_yet", "ton_kho"] as const;

/** Số nguyên từ số hoặc chuỗi số (cho phép “1.290.000”); undefined = không có khoá; NaN = sai kiểu. */
function intField(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "number") return Number.isInteger(v) ? v : Number.NaN;
  if (typeof v === "string" && /^\d{1,3}([.,]?\d{3})*$|^\d+$/.test(v.trim())) return Number(v.trim().replace(/[.,]/g, ""));
  return Number.NaN;
}

function newProduct(
  m: Record<string, unknown>,
  title: string,
  summary: string,
  ref: { slug?: string; source?: string; code?: string },
  err: (message: string) => void,
): NewProduct | undefined {
  const where = ref.slug ? `slug “${ref.slug}”` : `${ref.source}/${ref.code}`;
  if (!title) {
    err(`Chưa có sản phẩm ${where} trên website → gói sẽ TẠO MỚI, cần "tieu_de" (tên sản phẩm).`);
    return undefined;
  }
  const slug = (ref.slug ?? slugify(title)).toLowerCase();
  const brand = oneLine(m.thuong_hieu);
  const variants = productVariants(m, err);
  if (variants === undefined) return undefined;
  const errs = checkNewProductFields({ name: title, slug, brand, shortDescription: summary, variant: null });
  if (errs.length) {
    errs.forEach((e) => err(`Sản phẩm mới ${where}: ${e}`));
    return undefined;
  }
  const missing = ["Danh mục chính thức"];
  if (!variants) missing.push("Giá bán", "Tồn kho", "SKU");
  return { slug, name: title, brand, source: ref.source ?? null, code: ref.code ?? null, variants, missing };
}

const LEGACY_VARIANT_KEYS = ["sku", "gia_ban", "gia_niem_yet", "ton_kho"] as const;
const num = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? null : v);

/**
 * Biến thể của một mục sản phẩm. Hai cách (chỉ chọn MỘT):
 * - bộ cũ ở cấp sản phẩm: "sku", "gia_ban", "ton_kho" (+ "gia_niem_yet") → 1 biến thể không thuộc tính;
 * - "thuoc_tinh": ["Chiều dài", "Màu sắc"] + "bien_the": [{ sku, gia_ban, ton_kho, gia_niem_yet?, thuoc_tinh: { … } }].
 * Trả về null khi không có cách nào, undefined khi có lỗi (đã báo qua err).
 */
function productVariants(m: Record<string, unknown>, err: (message: string) => void): PkgVariants | null | undefined {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(m, k) && m[k] !== undefined && m[k] !== null && m[k] !== "";
  const legacy = LEGACY_VARIANT_KEYS.filter(has);
  const hasList = Object.prototype.hasOwnProperty.call(m, "bien_the");
  if (legacy.length && hasList) {
    err(
      `Mục này ghi cả bộ cũ (${legacy.map((k) => `"${k}"`).join(", ")}) lẫn "bien_the" — chọn MỘT cách: sản phẩm một giá dùng bộ cũ, nhiều biến thể dùng "bien_the".`,
    );
    return undefined;
  }
  if (hasList) return variantList(m, err);
  if (!legacy.length) return null;
  // Bộ cũ: đủ cả sku, gia_ban, ton_kho.
  const price = intField(m.gia_ban);
  const compare = intField(m.gia_niem_yet);
  const stock = intField(m.ton_kho);
  const sku = str(m.sku).toUpperCase();
  const lack = [!sku && '"sku"', price === undefined && '"gia_ban"', stock === undefined && '"ton_kho"'].filter(Boolean);
  if (lack.length) {
    err(`Đã ghi một phần giá/tồn kho — ghi đủ "sku", "gia_ban", "ton_kho" (thiếu ${lack.join(", ")}), hoặc bỏ cả để bổ sung sau trong quản trị.`);
    return undefined;
  }
  const v = { sku, price: num(price), compareAtPrice: compare === undefined ? null : Number.isNaN(compare) ? Number.MAX_SAFE_INTEGER : compare, stock: num(stock) };
  const errs = checkVariantFields(v);
  if (errs.length) {
    errs.forEach((e) => err(`SKU ${sku}: ${e}`));
    return undefined;
  }
  return { optionNames: [], list: [{ sku, price: v.price!, compareAtPrice: v.compareAtPrice, stock: v.stock!, options: {}, key: "" }] };
}

function variantList(m: Record<string, unknown>, err: (message: string) => void): PkgVariants | undefined {
  const raw = m.bien_the;
  if (!Array.isArray(raw) || raw.length === 0) {
    err('"bien_the" phải là danh sách có ít nhất 1 biến thể.');
    return undefined;
  }
  if (raw.length > MAX_VARIANTS) {
    err(`"bien_the" tối đa ${MAX_VARIANTS} biến thể.`);
    return undefined;
  }
  // Tên thuộc tính chọn hàng (giống ô “Thuộc tính” trong form): tối đa 3, không trùng, ≤ 30 ký tự.
  const namesRaw = m.thuoc_tinh ?? [];
  if (!Array.isArray(namesRaw)) {
    err('"thuoc_tinh" phải là danh sách tên thuộc tính, vd. ["Chiều dài", "Màu sắc"].');
    return undefined;
  }
  const optionNames = namesRaw.map((n) => oneLine(n));
  let ok = true;
  const fail = (message: string) => {
    err(message);
    ok = false;
  };
  if (optionNames.some((n) => !n)) fail('"thuoc_tinh" có tên trống.');
  if (optionNames.length > MAX_OPTION_GROUPS) fail(`"thuoc_tinh" tối đa ${MAX_OPTION_GROUPS} thuộc tính.`);
  if (optionNames.some((n) => n.length > OPTION_NAME_MAX)) fail(`Tên thuộc tính tối đa ${OPTION_NAME_MAX} ký tự.`);
  if (new Set(optionNames.map((n) => n.toLowerCase())).size !== optionNames.length) fail('"thuoc_tinh" có tên bị trùng.');
  if (!optionNames.length && raw.length !== 1)
    fail('Nhiều biến thể cần "thuoc_tinh" (vd. ["Chiều dài", "Màu sắc"]) và mỗi biến thể ghi "thuoc_tinh" tương ứng.');
  if (!ok) return undefined;

  const list: PkgVariant[] = [];
  const seenSku = new Map<string, number>();
  const seenKey = new Map<string, number>();
  raw.forEach((rv, i) => {
    const at = `"bien_the" thứ ${i + 1}`;
    if (typeof rv !== "object" || rv === null || Array.isArray(rv)) return fail(`${at}: phải có dạng { "sku", "gia_ban", "ton_kho", "thuoc_tinh" }.`);
    const o = rv as Record<string, unknown>;
    const sku = str(o.sku).toUpperCase();
    const label = sku ? `${at} (SKU ${sku})` : at;
    const price = intField(o.gia_ban);
    const compare = intField(o.gia_niem_yet);
    const stock = intField(o.ton_kho);
    const lack = [!sku && '"sku"', price === undefined && '"gia_ban"', stock === undefined && '"ton_kho"'].filter(Boolean);
    if (lack.length) return fail(`${label}: thiếu ${lack.join(", ")}.`);
    const v = { sku, price: num(price), compareAtPrice: compare === undefined ? null : Number.isNaN(compare) ? Number.MAX_SAFE_INTEGER : compare, stock: num(stock) };
    const errs = checkVariantFields(v);
    errs.forEach((e) => fail(`${label}: ${e}`));
    // Thuộc tính: đúng các tên trong "thuoc_tinh", mỗi giá trị 1–40 ký tự.
    const optRaw = o.thuoc_tinh ?? {};
    const options: Record<string, string> = {};
    if (typeof optRaw !== "object" || optRaw === null || Array.isArray(optRaw)) return fail(`${label}: "thuoc_tinh" phải có dạng { "Tên thuộc tính": "giá trị" }.`);
    const given = optRaw as Record<string, unknown>;
    const extra = Object.keys(given).filter((k) => !optionNames.some((n) => n.toLowerCase() === k.trim().toLowerCase()));
    if (extra.length) fail(`${label}: thuộc tính ${extra.map((k) => `“${k}”`).join(", ")} không có trong "thuoc_tinh" của sản phẩm.`);
    for (const name of optionNames) {
      const k = Object.keys(given).find((x) => x.trim().toLowerCase() === name.toLowerCase());
      const value = k ? oneLine(given[k]) : "";
      if (!value) fail(`${label}: thiếu giá trị “${name}”.`);
      else if (value.length > OPTION_VALUE_MAX) fail(`${label}: giá trị “${name}” tối đa ${OPTION_VALUE_MAX} ký tự.`);
      options[name] = value;
    }
    if (seenSku.has(sku)) fail(`${label}: SKU trùng với biến thể thứ ${seenSku.get(sku)}.`);
    else seenSku.set(sku, i + 1);
    const key = optionsKey(options);
    if (optionNames.length) {
      if (seenKey.has(key)) fail(`${label}: tổ hợp ${Object.values(options).join(" / ")} trùng với biến thể thứ ${seenKey.get(key)}.`);
      else seenKey.set(key, i + 1);
    }
    if (!errs.length) list.push({ sku, price: v.price!, compareAtPrice: v.compareAtPrice, stock: v.stock!, options, key });
  });
  return ok ? { optionNames, list } : undefined;
}

export type PkgIssue = { item: number | null; message: string };
export type ValidatedPackage = {
  name: string;
  author: string;
  date: string;
  items: PkgItem[];
  /** Đường dẫn ảnh dùng trong gói → SHA-256 của tệp gốc. */
  images: Map<string, string>;
  errors: PkgIssue[];
  warnings: PkgIssue[];
};

export type ProductLookup = (ref: { slug?: string; source?: string; code?: string }) => { id: string; label: string } | null;
export type CategoryLookup = (slug: string) => { id: number; label: string } | null;

const str = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim() : "");
const oneLine = (v: unknown) => str(v).replace(/\s+/g, " ");

export function validatePackage(
  files: Map<string, Buffer>,
  ignored: string[],
  lookupProduct: ProductLookup,
  lookupCategory: CategoryLookup = () => null,
): ValidatedPackage {
  const errors: PkgIssue[] = [];
  const warnings: PkgIssue[] = [];
  const images = new Map<string, string>();
  const used = new Set<string>(["goi.json"]);
  const result: ValidatedPackage = { name: "", author: "", date: "", items: [], images, errors, warnings };
  if (ignored.length) warnings.push({ item: null, message: `Bỏ qua tệp hệ thống: ${ignored.slice(0, 5).join(", ")}${ignored.length > 5 ? "…" : ""}` });

  const raw = files.get("goi.json");
  if (!raw) {
    errors.push({ item: null, message: "Thiếu goi.json ở gốc ZIP (đừng nén cả thư mục chứa gói)." });
    return result;
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(decodeText(raw, "goi.json"));
  } catch (e) {
    errors.push({ item: null, message: e instanceof Error && e.message.includes("UTF-8") ? e.message : "goi.json không phải JSON hợp lệ." });
    return result;
  }
  if (manifest?.dinh_dang !== PACKAGE_FORMAT || manifest?.phien_ban !== PACKAGE_VERSION) {
    errors.push({ item: null, message: `goi.json cần "dinh_dang": "${PACKAGE_FORMAT}" và "phien_ban": ${PACKAGE_VERSION}.` });
    return result;
  }
  result.name = oneLine(manifest.ten_goi).slice(0, 150);
  result.author = oneLine(manifest.nguoi_soan).slice(0, 80);
  result.date = oneLine(manifest.ngay_soan).slice(0, 20);
  const list = manifest.muc;
  if (!Array.isArray(list) || list.length === 0) {
    errors.push({ item: null, message: "goi.json: “muc” cần là danh sách có ít nhất 1 mục." });
    return result;
  }
  if (list.length > MAX_ITEMS) {
    errors.push({ item: null, message: `Tối đa ${MAX_ITEMS} mục trong một gói.` });
    return result;
  }

  const seenTargets = new Map<string, number>();
  list.forEach((rawItem, i) => {
    const n = i + 1;
    const err = (message: string) => errors.push({ item: n, message });
    const warn = (message: string) => warnings.push({ item: n, message });
    if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) return err("Mục không hợp lệ.");
    const m = rawItem as Record<string, unknown>;
    const kind = m.loai;

    // Ảnh tham chiếu: phải là tệp ảnh trong anh/, có alt.
    const imageRef = (v: unknown, where: string): ImgRef | null => {
      if (v === undefined || v === null) return null;
      const o = (typeof v === "object" ? v : {}) as Record<string, unknown>;
      const path = str(o.tep);
      const alt = oneLine(o.alt);
      if (!path) return (err(`${where}: thiếu "tep".`), null);
      if (!/^anh\/.+\.(jpe?g|png|webp)$/.test(path)) return (err(`${where}: “${path}” phải là ảnh trong thư mục anh/.`), null);
      if (!files.has(path)) return (err(`${where}: không có tệp ${path} trong ZIP.`), null);
      if (!alt) err(`${where}: ảnh ${path} thiếu "alt" (văn bản thay thế).`);
      if (alt.length > ALT_MAX) err(`${where}: "alt" tối đa ${ALT_MAX} ký tự.`);
      used.add(path);
      if (!images.has(path)) images.set(path, createHash("sha256").update(files.get(path)!).digest("hex"));
      return { path, alt };
    };

    // Bài viết .md
    const hasKey = (k: string) => Object.prototype.hasOwnProperty.call(m, k);
    const optionalBody = kind === "danh_muc";
    const bodyGiven = optionalBody ? hasKey("bai_viet") : true;
    if (optionalBody && bodyGiven && typeof m.bai_viet !== "string")
      err('"bai_viet" phải là chuỗi: đường dẫn tệp .md, hoặc "" để xoá nội dung chi tiết. Bỏ hẳn khoá này để giữ nguyên.');
    const skipBody = optionalBody && (!bodyGiven || typeof m.bai_viet !== "string" || m.bai_viet.trim() === "");
    const bodyPath = skipBody ? "" : str(m.bai_viet);
    let body = "";
    const inline: string[] = [];
    const bodyMax = kind === "san_pham" ? PRODUCT_BODY_MAX : CONTENT_BODY_MAX;
    if (skipBody) {
      // danh_muc: không có khoá (giữ) hoặc "" (xoá) — không đọc tệp.
    } else if (!bodyPath) err('Thiếu "bai_viet".');
    else if (!/^bai\/.+\.md$/.test(bodyPath)) err(`"bai_viet" phải là tệp .md trong thư mục bai/ (đang là “${bodyPath}”).`);
    else if (!files.has(bodyPath)) err(`Không có tệp ${bodyPath} trong ZIP.`);
    else {
      used.add(bodyPath);
      try {
        body = decodeText(files.get(bodyPath)!, bodyPath).replace(/\r\n?/g, "\n").trim();
      } catch (e) {
        err((e as Error).message);
      }
      if (!body) err(`${bodyPath}: bài viết trống.`);
      if (body.length > bodyMax) err(`${bodyPath}: tối đa ${bodyMax.toLocaleString("vi-VN")} ký tự (đang ${body.length.toLocaleString("vi-VN")}).`);
      body.split("\n").forEach((rawLine, li) => {
        const line = rawLine.trim();
        const at = `${bodyPath} dòng ${li + 1}`;
        if (/<\/?[a-z][a-z0-9-]*(\s[^<>]*)?\/?>|<!--/i.test(line)) err(`${at}: không dùng mã HTML.`);
        if (/^#\s/.test(line)) err(`${at}: không dùng tiêu đề “#” (tiêu đề bài lấy từ "tieu_de"); dùng “##” hoặc “###”.`);
        const img = line.match(IMAGE_LINE);
        if (img) {
          const src = img[2];
          if (!/^anh\/.+\.(jpe?g|png|webp)$/.test(src)) return err(`${at}: ảnh phải lấy từ thư mục anh/ trong gói (đang là “${src.slice(0, 60)}”).`);
          if (!files.has(src)) return err(`${at}: không có tệp ${src} trong ZIP.`);
          if (!img[1].trim()) err(`${at}: ảnh ${src} thiếu văn bản thay thế ![…](…).`);
          if (img[1].length > ALT_MAX || (img[3] ?? "").length > ALT_MAX) err(`${at}: văn bản thay thế/chú thích tối đa ${ALT_MAX} ký tự.`);
          used.add(src);
          if (!images.has(src)) images.set(src, createHash("sha256").update(files.get(src)!).digest("hex"));
          if (!inline.includes(src)) inline.push(src);
        } else if (line.includes("![")) {
          err(`${at}: ảnh phải nằm trên một dòng riêng, dạng ![mô tả](anh/ten.jpg "chú thích").`);
        }
      });
    }

    const seo: SeoPatch = {};
    for (const [key, field, max] of [
      ["seo_title", "title", SEO_TITLE_MAX],
      ["seo_description", "description", SEO_DESCRIPTION_MAX],
    ] as const) {
      if (!Object.prototype.hasOwnProperty.call(m, key)) continue;
      const v = m[key];
      if (typeof v !== "string") {
        err(`"${key}" phải là chuỗi. Bỏ hẳn khoá này để giữ giá trị đang lưu, hoặc dùng "" để quay về mặc định.`);
        continue;
      }
      const t = normalizeSeoText(v);
      if (t.length > max) err(`"${key}" tối đa ${max} ký tự.`);
      seo[field] = t || null;
    }

    const title = oneLine(m.tieu_de);
    const summary = oneLine(m.mo_ta_ngan);
    if (title.length > CONTENT_TITLE_MAX) err(`"tieu_de" tối đa ${CONTENT_TITLE_MAX} ký tự.`);
    if (summary.length > SUMMARY_MAX) err(`"mo_ta_ngan" tối đa ${SUMMARY_MAX} ký tự.`);

    const once = (key: string, label: string) => {
      if (seenTargets.has(key)) err(`${label} đã có ở mục ${seenTargets.get(key)}; mỗi nội dung chỉ một mục trong gói.`);
      else seenTargets.set(key, n);
    };

    /** "video_san_pham": danh sách { tieu_de, url, anh_bia? } — báo lỗi theo từng video. */
    const productVideos = (v: unknown): PkgVideo[] => {
      if (!Array.isArray(v)) {
        err('"video_san_pham" phải là danh sách (bỏ hẳn khoá này để giữ nguyên video hiện có).');
        return [];
      }
      if (v.length > MAX_VIDEOS_PER_PRODUCT) err(`"video_san_pham" tối đa ${MAX_VIDEOS_PER_PRODUCT} video.`);
      const out: PkgVideo[] = [];
      const seenIds = new Map<string, number>();
      v.forEach((raw, vi) => {
        const at = `"video_san_pham" thứ ${vi + 1}`;
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return err(`${at}: phải có dạng { "tieu_de": …, "url": … }.`);
        const o = raw as Record<string, unknown>;
        let ok = true;
        const fail = (message: string) => {
          err(`${at}: ${message}`);
          ok = false;
        };
        const title = oneLine(o.tieu_de);
        if (title.length < 2) fail('thiếu "tieu_de" (vd. “Hướng dẫn kết nối”).');
        else if (title.length > VIDEO_TITLE_MAX) fail(`"tieu_de" tối đa ${VIDEO_TITLE_MAX} ký tự.`);
        const parsed = parseVideoUrl(typeof o.url === "string" ? o.url : "");
        if (!parsed.ok)
          fail(
            parsed.shortTikTok
              ? '"url" là link TikTok rút gọn (vt./vm.tiktok.com) — dùng link đầy đủ dạng tiktok.com/@tên-tài-khoản/video/…'
              : `"url" — ${parsed.message}`,
          );
        let cover: string | null = null;
        if (o.anh_bia !== undefined && o.anh_bia !== null && o.anh_bia !== "") {
          const p = str(o.anh_bia);
          if (!/^anh\/.+\.(jpe?g|png|webp)$/.test(p)) fail(`"anh_bia" “${p}” phải là ảnh trong thư mục anh/.`);
          else if (!files.has(p)) fail(`không tìm thấy ảnh bìa ${p} trong ZIP.`);
          else {
            cover = p;
            used.add(p);
            if (!images.has(p)) images.set(p, createHash("sha256").update(files.get(p)!).digest("hex"));
          }
        }
        if (!ok || !parsed.ok) return;
        const key = `${parsed.video.platform}:${parsed.video.videoId}`;
        if (seenIds.has(key)) return err(`${at}: trùng video thứ ${seenIds.get(key)} của cùng sản phẩm.`);
        seenIds.set(key, vi + 1);
        out.push({
          title,
          url: parsed.video.sourceUrl,
          platform: parsed.video.platform,
          videoId: parsed.video.videoId,
          orientation: parsed.video.orientation,
          cover,
        });
      });
      return out;
    };

    if (kind === "san_pham") {
      const ref = { slug: str(m.slug) || undefined, source: str(m.nguon) || undefined, code: str(m.ma_san_pham) || undefined };
      if (!ref.slug && !(ref.source && ref.code)) return err('Sản phẩm cần "slug" hoặc cặp "nguon" + "ma_san_pham".');
      const found = lookupProduct(ref);
      // Không tìm thấy → sản phẩm MỚI (tạo trong “Danh mục chờ”, Ẩn) — kiểm tra theo quy tắc form tạo sản phẩm.
      let create: NewProduct | undefined;
      let existingVariants: PkgVariants | undefined;
      if (!found) {
        create = newProduct(m, title, summary, ref, err);
        if (!create) return;
      } else if (hasKey("bien_the")) {
        // Sản phẩm đã có + "bien_the": đối chiếu theo SKU ở bước xem trước (thêm / cập nhật / giữ nguyên).
        const v = productVariants(m, err);
        if (!v) return;
        existingVariants = v;
        if (hasKey("thuong_hieu")) warn('Sản phẩm đã có: gói không đổi thương hiệu — bỏ qua "thuong_hieu".');
      } else {
        const ignored = CREATE_ONLY_KEYS.filter((k) => hasKey(k));
        if (ignored.length)
          warn(
            `Sản phẩm đã có: bộ cũ ${ignored.map((k) => `"${k}"`).join(", ")} bị bỏ qua (gói không đổi giá/tồn kho theo bộ cũ). Muốn cập nhật giá/tồn kho, dùng "bien_the".`,
          );
      }
      const product = found ?? { id: `${NEW_PRODUCT_PREFIX}${create!.slug}`, label: create!.name };
      once(`sp:${product.id}`, `Sản phẩm ${product.label}`);
      const cover = imageRef(m.anh_dai_dien, '"anh_dai_dien"');
      const galleryRaw = m.anh_san_pham ?? [];
      if (!Array.isArray(galleryRaw)) return err('"anh_san_pham" phải là danh sách.');
      if (galleryRaw.length > PRODUCT_GALLERY_MAX) err(`"anh_san_pham" tối đa ${PRODUCT_GALLERY_MAX} ảnh.`);
      const gallery = galleryRaw.map((g, gi) => imageRef(g, `"anh_san_pham" thứ ${gi + 1}`)).filter((g): g is ImgRef => g !== null);
      const videos = hasKey("video_san_pham") ? productVideos(m.video_san_pham) : undefined;
      result.items.push({
        kind: "san_pham",
        index: n,
        label: product.label,
        productId: product.id,
        name: title || null,
        summary: summary || null,
        bodyPath,
        body,
        inline,
        cover,
        gallery,
        ...(videos ? { videos } : {}),
        ...(create ? { create } : {}),
        ...(existingVariants ? { variants: existingVariants } : {}),
        seo,
      });
    } else if (kind === "tin_tuc") {
      const slug = str(m.slug).toLowerCase();
      if (!slug || slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(slug)) return err('"slug" tin tức chỉ gồm chữ thường không dấu, số và “-”.');
      if (!title) err('Tin tức cần "tieu_de".');
      once(`tt:${slug}`, `Tin tức “${slug}”`);
      const cover = imageRef(m.anh_dai_dien, '"anh_dai_dien"');
      result.items.push({ kind: "tin_tuc", index: n, label: title || slug, slug, title, summary, bodyPath, body, inline, cover, seo });
    } else if (kind === "trang") {
      const slug = str(m.slug);
      const def = CONTENT_PAGES.find((p) => p.slug === slug);
      if (!def) return err(`"slug" trang phải là một trong: ${CONTENT_PAGES.map((p) => p.slug).join(", ")}.`);
      if (!title) err('Trang cần "tieu_de".');
      if (summary) warn('Trang nội dung không dùng "mo_ta_ngan" — bỏ qua.');
      if (m.anh_dai_dien) warn('Trang nội dung không có ảnh đại diện — bỏ qua "anh_dai_dien".');
      once(`tr:${slug}`, `Trang “${def.label}”`);
      result.items.push({ kind: "trang", index: n, label: def.label, slug, title, bodyPath, body, inline, seo });
    } else if (kind === "danh_muc") {
      const slug = str(m.slug).toLowerCase();
      if (!slug) return err('Danh mục cần "slug" của danh mục đã có.');
      const cat = lookupCategory(slug);
      if (!cat) return err(`Không tìm thấy danh mục slug “${slug}”. Gói chỉ cập nhật danh mục đã có, không tạo danh mục mới.`);
      once(`dm:${cat.id}`, `Danh mục ${cat.label}`);
      let summary: string | undefined;
      if (hasKey("mo_ta_ngan")) {
        if (typeof m.mo_ta_ngan !== "string") err('"mo_ta_ngan" phải là chuỗi ("" để xoá mô tả ngắn). Bỏ hẳn khoá này để giữ nguyên.');
        else summary = oneLine(m.mo_ta_ngan);
      }
      for (const k of ["tieu_de", "anh_dai_dien", "anh_san_pham", "video_san_pham"])
        if (hasKey(k)) warn(`Danh mục không đổi tên hay ảnh qua gói — bỏ qua "${k}".`);
      if (summary === undefined && !bodyGiven && seo.title === undefined && seo.description === undefined)
        warn("Mục danh mục không có trường nào để cập nhật.");
      result.items.push({ kind: "danh_muc", index: n, label: cat.label, slug, categoryId: cat.id, summary, bodyGiven, bodyPath, body, inline, seo });
    } else {
      err('"loai" phải là "san_pham", "tin_tuc", "trang" hoặc "danh_muc".');
    }
  });

  // SKU trùng giữa các mục sản phẩm khác nhau trong cùng gói.
  const skuOwner = new Map<string, number>();
  for (const it of result.items) {
    if (it.kind !== "san_pham") continue;
    for (const v of (it.create?.variants ?? it.variants)?.list ?? []) {
      const prev = skuOwner.get(v.sku);
      if (prev !== undefined && prev !== it.index) errors.push({ item: it.index, message: `SKU ${v.sku} đã dùng ở mục ${prev} của gói.` });
      else skuOwner.set(v.sku, it.index);
    }
  }

  for (const name of files.keys()) if (!used.has(name)) warnings.push({ item: null, message: `Tệp không được dùng: ${name}` });
  return result;
}
