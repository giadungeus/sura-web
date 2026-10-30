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

/** SKU: chữ in hoa, số, gạch ngang hoặc gạch dưới, 2–40 ký tự. */
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

export function skuFromText(input: string): string {
  return slugify(input, 40).toUpperCase();
}
