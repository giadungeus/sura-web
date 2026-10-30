/**
 * Chuẩn hóa chuỗi tiếng Việt để so khớp không phân biệt dấu và hoa/thường.
 * "Điện Thoại" -> "dien thoai"
 */
export function normalizeVietnamese(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tách truy vấn thành các từ khóa đã chuẩn hóa. */
export function tokenize(query: string): string[] {
  return normalizeVietnamese(query).split(" ").filter(Boolean);
}

/** Đúng khi mọi từ khóa đều xuất hiện trong văn bản đã chuẩn hóa. */
export function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  return tokens.every((token) => haystack.includes(token));
}
