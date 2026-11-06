import { normalizeVietnamese } from "./search.ts";

/** "Áo sơ mi Oxford" -> "ao-so-mi-oxford" */
export function slugify(input: string, maxLength = 80): string {
  return normalizeVietnamese(input)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 80;

/**
 * Slug chưa dùng, tối đa `maxLength` ký tự: thử `base`, rồi `base-2`, `base-3`…
 * Cắt phần gốc TRƯỚC khi ghép để luôn chừa đủ chỗ cho cả hậu tố (kể cả khi -9 thành -10),
 * nên mỗi lần lặp tạo ra một slug khác và vòng lặp chắc chắn kết thúc.
 */
export function uniqueSlug(base: string, isTaken: (slug: string) => boolean, maxLength = SLUG_MAX_LENGTH): string {
  const root = base.slice(0, maxLength).replace(/-+$/g, "");
  if (root && !isTaken(root)) return root;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const head = root.slice(0, maxLength - suffix.length).replace(/-+$/g, "");
    const slug = head ? `${head}${suffix}` : String(n);
    if (!isTaken(slug)) return slug;
  }
}

/** SKU: chữ in hoa, số, gạch ngang hoặc gạch dưới, 2–40 ký tự. */
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

export function skuFromText(input: string): string {
  return slugify(input, 40).toUpperCase();
}
