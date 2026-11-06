/**
 * Công cụ CHỈ ĐỌC cho chatbot. Chỉ dùng dữ liệu công khai (sản phẩm/danh mục đang Hiện, trang nội dung
 * đang công khai). Không SQL tuỳ ý, không URL tuỳ ý, không đơn hàng/khách hàng/quản trị.
 * Mọi tham số từ model được kiểm tra và giới hạn ở đây.
 */
import "server-only";
import { applyVariables } from "@/lib/content/markup";
import { CONTENT_PAGES, pageBySlug } from "@/lib/content/pages";
import { getCategories, getCategoryTrail, getProductBySlug, getProducts, getProductsByCategory } from "@/lib/data/catalog";
import { normalizeVietnamese } from "@/lib/search";
import { clipText, markupToPlainText } from "@/lib/seo-text";
import { getPublicContentPage, getSiteChrome } from "@/lib/server/site-content";
import type { Product } from "@/types";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+){0,15}$/;
const POLICY_SLUGS = CONTENT_PAGES.map((p) => p.slug);
const OUTPUT_MAX = 6000;

const nullable = (type: string) => ({ type: [type, "null"] });

/** Định nghĩa công cụ gửi cho model (Responses API, strict). */
export const TOOL_DEFS = [
  {
    type: "function",
    name: "tim_san_pham",
    description:
      "Tìm sản phẩm đang bán trên Sura theo từ khoá, danh mục, khoảng giá (VNĐ). Trả về tối đa 8 sản phẩm kèm giá thấp nhất/cao nhất, còn hàng hay không, có giảm giá thật không.",
    parameters: {
      type: "object",
      properties: {
        tu_khoa: { ...nullable("string"), description: "Từ khoá tiếng Việt, vd. “loa bluetooth chống nước”." },
        danh_muc: { ...nullable("string"), description: "Slug danh mục (lấy từ danh_sach_danh_muc)." },
        gia_toi_thieu: { ...nullable("integer"), description: "Giá tối thiểu (VNĐ)." },
        gia_toi_da: { ...nullable("integer"), description: "Giá tối đa (VNĐ)." },
        chi_con_hang: { ...nullable("boolean"), description: "true = chỉ sản phẩm còn hàng." },
        so_luong: { ...nullable("integer"), description: "Số kết quả (1–8)." },
      },
      required: ["tu_khoa", "danh_muc", "gia_toi_thieu", "gia_toi_da", "chi_con_hang", "so_luong"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "chi_tiet_san_pham",
    description: "Chi tiết một sản phẩm đang bán: từng phiên bản (giá, giá niêm yết, còn hàng), thông số, điểm nổi bật, mô tả.",
    parameters: {
      type: "object",
      properties: { slug: { type: "string", description: "Slug sản phẩm (từ kết quả tìm kiếm)." } },
      required: ["slug"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "danh_sach_danh_muc",
    description: "Danh sách danh mục đang hiển thị trên Sura (tên, slug, danh mục cha).",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "chinh_sach",
    description: "Nội dung một trang chính sách/hướng dẫn đang công khai trên website.",
    parameters: {
      type: "object",
      properties: { trang: { type: "string", enum: POLICY_SLUGS, description: "Mã trang." } },
      required: ["trang"],
      additionalProperties: false,
    },
    strict: true,
  },
] as const;

const productUrl = (slug: string) => `/san-pham/${slug}`;
const variantLabel = (o: Record<string, string>) => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(", ") || "Mặc định";

function summary(p: Product) {
  const prices = p.variants.map((v) => v.price);
  return {
    slug: p.slug,
    ten: p.name,
    thuong_hieu: p.brand || null,
    lien_ket: productUrl(p.slug),
    gia_thap_nhat: Math.min(...prices),
    gia_cao_nhat: Math.max(...prices),
    con_hang: p.variants.some((v) => v.stock > 0),
    co_giam_gia: p.variants.some((v) => v.compareAtPrice && v.compareAtPrice > v.price),
    so_phien_ban: p.variants.length,
    mo_ta_ngan: clipText(p.shortDescription, 160),
  };
}

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

async function timSanPham(a: Record<string, unknown>) {
  const kw = str(a.tu_khoa, 80);
  const cat = str(a.danh_muc, 80);
  const min = int(a.gia_toi_thieu, 0, 1e11);
  const max = int(a.gia_toi_da, 0, 1e11);
  const limit = int(a.so_luong, 1, 8) ?? 5;
  let list: Product[] = cat && SLUG.test(cat) ? await getProductsByCategory(cat) : await getProducts();
  if (kw) {
    const tokens = normalizeVietnamese(kw).split(" ").filter((t) => t.length > 1);
    const scored = list
      .map((p) => {
        const hay = normalizeVietnamese([p.name, p.brand, p.shortDescription, ...p.highlights, ...p.variants.map((v) => v.sku)].join(" "));
        return { p, score: tokens.filter((t) => hay.includes(t)).length };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score);
    list = scored.map((x) => x.p);
  }
  if (min !== null) list = list.filter((p) => p.variants.some((v) => v.price >= min));
  if (max !== null) list = list.filter((p) => p.variants.some((v) => v.price <= max));
  if (a.chi_con_hang === true) list = list.filter((p) => p.variants.some((v) => v.stock > 0));
  return { tong_so: list.length, san_pham: list.slice(0, limit).map(summary) };
}

async function chiTiet(a: Record<string, unknown>) {
  const slug = str(a.slug, 80);
  const p = SLUG.test(slug) ? await getProductBySlug(slug) : undefined;
  if (!p) return { loi: "Không có sản phẩm đang bán với slug này." };
  const trail = await getCategoryTrail(p.category);
  const attrs = trail.at(-1)?.attributes ?? [];
  return {
    ...summary(p),
    danh_muc: trail.map((c) => c.name).join(" > "),
    phien_ban: p.variants.map((v) => ({
      phien_ban: variantLabel(v.options),
      sku: v.sku,
      gia: v.price,
      gia_niem_yet: v.compareAtPrice && v.compareAtPrice > v.price ? v.compareAtPrice : null,
      con_hang: v.stock > 0,
    })),
    thong_so: Object.fromEntries(attrs.filter((x) => p.specs[x.key]).map((x) => [x.label, p.specs[x.key]])),
    diem_noi_bat: p.highlights.slice(0, 10),
    mo_ta: clipText(markupToPlainText(p.description), 1200),
  };
}

async function danhMuc() {
  const cats = await getCategories();
  const name = new Map(cats.map((c) => [c.slug, c.name]));
  return { danh_muc: cats.map((c) => ({ slug: c.slug, ten: c.name, cha: c.parent ? (name.get(c.parent) ?? null) : null, lien_ket: `/danh-muc/${c.slug}` })) };
}

/** Trang chính sách đang công khai (dùng cho cả công cụ và câu trả lời nhanh không gọi AI). */
export async function policyPage(slug: string, maxChars = 3000): Promise<{ title: string; path: string; text: string } | null> {
  const def = pageBySlug(slug);
  if (!def) return null;
  const page = await getPublicContentPage(slug);
  if (!page) return null;
  const { vars } = await getSiteChrome();
  return { title: applyVariables(page.title, vars), path: def.path, text: clipText(markupToPlainText(applyVariables(page.body, vars)), maxChars) };
}

async function chinhSach(a: Record<string, unknown>) {
  const slug = str(a.trang, 40);
  if (!POLICY_SLUGS.includes(slug)) return { loi: "Trang không hợp lệ." };
  const p = await policyPage(slug);
  return p ? { tieu_de: p.title, lien_ket: p.path, noi_dung: p.text } : { loi: "Trang này chưa được công khai trên website." };
}

/** Chạy một công cụ theo tên (danh sách cố định). Kết quả là chuỗi JSON đã giới hạn độ dài. */
export async function runTool(name: string, rawArgs: string): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawArgs) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
  } catch {
    return JSON.stringify({ loi: "Tham số không hợp lệ." });
  }
  let out: unknown;
  switch (name) {
    case "tim_san_pham":
      out = await timSanPham(args);
      break;
    case "chi_tiet_san_pham":
      out = await chiTiet(args);
      break;
    case "danh_sach_danh_muc":
      out = await danhMuc();
      break;
    case "chinh_sach":
      out = await chinhSach(args);
      break;
    default:
      out = { loi: "Công cụ không tồn tại." };
  }
  const json = JSON.stringify(out);
  return json.length > OUTPUT_MAX ? JSON.stringify({ canh_bao: "Kết quả quá dài, đã rút gọn.", du_lieu: json.slice(0, OUTPUT_MAX) }) : json;
}

/** Thẻ sản phẩm do MÁY CHỦ dựng từ dữ liệu thật (giá, tồn, liên kết đã xác minh). */
export type ProductCard = {
  slug: string;
  name: string;
  url: string;
  /** Giá hiển thị: phiên bản rẻ nhất CÒN HÀNG (hết hàng cả thì phiên bản rẻ nhất). */
  price: number;
  minPrice: number;
  maxPrice: number;
  /** Giá niêm yết của phiên bản rẻ nhất còn hàng (chỉ khi thực sự cao hơn giá bán). */
  compareAt: number | null;
  inStock: boolean;
  variants: number;
  imageUrl: string | null;
};
export async function productCards(slugs: string[]): Promise<ProductCard[]> {
  const out: ProductCard[] = [];
  for (const slug of [...new Set(slugs)].slice(0, 6)) {
    if (!SLUG.test(slug)) continue;
    const p = await getProductBySlug(slug);
    if (!p) continue; // sản phẩm Ẩn/không tồn tại/danh mục Ẩn → bỏ
    const inStockVariants = p.variants.filter((v) => v.stock > 0);
    const shown = (inStockVariants.length ? inStockVariants : p.variants).reduce((m, v) => (v.price < m.price ? v : m));
    const prices = p.variants.map((v) => v.price);
    out.push({
      slug: p.slug,
      name: p.name,
      url: productUrl(p.slug),
      price: shown.price,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      compareAt: inStockVariants.length && shown.compareAtPrice && shown.compareAtPrice > shown.price ? shown.compareAtPrice : null,
      inStock: inStockVariants.length > 0,
      variants: p.variants.length,
      imageUrl: p.image.url ?? null,
    });
  }
  return out;
}
