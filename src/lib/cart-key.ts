import type { SelectedOptions } from "@/types";

/** Khóa ổn định cho một sản phẩm cùng bộ biến thể đã chọn (dùng chung client và server). */
export function makeCartKey(productId: string, options: SelectedOptions): string {
  const parts = Object.keys(options)
    .sort()
    .map((name) => `${name}=${options[name]}`);
  return [productId, ...parts].join("|");
}
