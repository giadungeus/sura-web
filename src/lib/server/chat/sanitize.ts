/** Độ dài tối đa câu trả lời hiển thị (≈ 1.000 token đầu ra). */
export const REPLY_MAX_CHARS = 5000;

/** Nguồn web lấy từ kết quả tìm của OpenAI (không phải do model tự viết). */
export type WebSource = { url: string; title: string; cited: boolean };

const normUrl = (raw: string): string | null => {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
};

/**
 * Làm gọn văn bản AI viết. GIỮ Markdown, số, giá, thông số và liên kết (giao diện tự hiển thị an toàn, không chạy HTML).
 * - Bỏ ký tự điều khiển; chuẩn hoá xuống dòng; gộp nhiều dòng trống; giới hạn độ dài.
 * - \`allowed\` (khi lượt có tìm web): liên kết không trùng nguồn tìm được thì KHÔNG cho bấm — [chữ](url lạ) → chữ,
 *   đường link trần lạ → để trong \`…\` (hiển thị dạng chữ). Chống bịa nguồn.
 */
export function cleanReply(text: string, allowed?: Set<string>): string {
  let out = text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (allowed) {
    const ok = (u: string) => {
      const n = normUrl(u);
      return !!n && (allowed.has(n) || allowed.has(n.replace(/\/$/, "")) || allowed.has(n + "/"));
    };
    out = out.replace(/\[([^\]\n]{1,200})\]\(([^)\s]+)\)/g, (m, label: string, url: string) => (ok(url) ? m : label));
    // Đường link trần (không nằm trong (…) của Markdown link) không trùng nguồn → hiển thị dạng chữ.
    out = out.replace(/(^|[^(\w`])(https?:\/\/[^\s<>"'`)\]]+)/g, (m, pre: string, url: string) => {
      const clean = url.replace(/[.,;:!?]+$/, "");
      return ok(clean) ? m : `${pre}\`${clean}\`${url.slice(clean.length)}`;
    });
  }
  return out.slice(0, REPLY_MAX_CHARS);
}
