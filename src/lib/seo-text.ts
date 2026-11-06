/**
 * Quy tắc tiêu đề/mô tả SEO dùng chung cho trang công khai và bản xem trước trong quản trị
 * (module thuần, chạy được cả server và trình duyệt).
 *
 * - seo_title có giá trị → dùng NGUYÊN VĂN (không tự thêm tên thương hiệu).
 * - Không có → “Tên | Thương hiệu”; nếu tên đã chứa tên thương hiệu thì giữ nguyên tên.
 * - seo_description có giá trị → dùng nguyên văn; không có → mô tả sẵn có, đã bỏ mã định dạng.
 */
import { parseMarkup, type Inline } from "@/lib/content/markup";

/** URL chuẩn của website (đổi bằng NEXT_PUBLIC_SITE_URL lúc build nếu cần). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://sura.vn").replace(/\/+$/, "");

/** Giới hạn chỉ để chống dữ liệu hỏng — KHÔNG phải quy tắc độ dài hiển thị trên Google. */
export const SEO_TITLE_MAX = 200;
export const SEO_DESCRIPTION_MAX = 500;
/** Độ dài tham khảo để cắt mô tả MẶC ĐỊNH (lấy từ nội dung); giá trị nhập tay không bị cắt. */
const FALLBACK_DESCRIPTION_LENGTH = 160;

/** Chuẩn hoá ô nhập SEO: bỏ ký tự điều khiển, gộp khoảng trắng. Chuỗi rỗng = dùng mặc định. */
export function normalizeSeoText(v: unknown): string {
  return typeof v === "string"
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

const inlineText = (nodes: Inline[]): string => nodes.map((n) => (n.type === "text" ? n.text : inlineText(n.children))).join("");

/** Văn bản thuần từ nội dung có định dạng (bỏ **, liên kết, ảnh, bảng). */
export function markupToPlainText(source: string, firstParagraphOnly = false): string {
  const parts: string[] = [];
  for (const b of parseMarkup(source)) {
    if (b.type === "p") {
      parts.push(b.lines.map(inlineText).join(" "));
      if (firstParagraphOnly) break;
    } else if (!firstParagraphOnly && (b.type === "ul" || b.type === "ol")) parts.push(b.items.map(inlineText).join("; "));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Cắt mô tả mặc định ở ranh giới từ cho gọn; không áp cho giá trị quản trị tự nhập. */
export function clipText(text: string, max = FALLBACK_DESCRIPTION_LENGTH): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

export function defaultTitle(name: string, brand: string): string {
  const n = name.trim();
  if (!brand || n.toLocaleLowerCase("vi").includes(brand.toLocaleLowerCase("vi"))) return n;
  return `${n} | ${brand}`;
}

/** Tiêu đề và mô tả cuối cùng của một trang. */
export function resolveSeo(
  seo: { seoTitle?: string | null; seoDescription?: string | null },
  fallback: { name: string; description: string },
  brand: string,
): { title: string; description: string } {
  const t = normalizeSeoText(seo.seoTitle);
  const d = normalizeSeoText(seo.seoDescription);
  return {
    title: t || defaultTitle(fallback.name, brand),
    description: d || clipText(markupToPlainText(fallback.description)),
  };
}

export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
