import type { SelectedOptions } from "@/types";

/** Khoá chuẩn của bộ thuộc tính biến thể (không phụ thuộc thứ tự): "Màu sắc=Đen|Size=M". */
export function optionsKey(options: SelectedOptions): string {
  return Object.keys(options)
    .sort()
    .map((name) => `${name}=${options[name]}`)
    .join("|");
}

/** Khóa ổn định cho một sản phẩm cùng bộ biến thể đã chọn (dùng chung client và server). */
export function makeCartKey(productId: string, options: SelectedOptions): string {
  const key = optionsKey(options);
  return key ? `${productId}|${key}` : productId;
}
