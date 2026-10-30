import "server-only";
import { siteConfig } from "@/config/site";
import { makeCartKey } from "@/lib/cart-key";
import type { CartIssue, OrderItemInput, PricedLine, Quote } from "@/lib/checkout/types";
import { getProductById } from "@/lib/data/catalog";
import type { Product, SelectedOptions } from "@/types";

export const MAX_LINES = 50;
const MAX_QUANTITY_PER_LINE = 999;

/**
 * Kiểm tra cấu trúc danh sách hàng gửi từ trình duyệt.
 * Trả về null nếu dữ liệu không đúng dạng (bị sửa tay hoặc quá lớn).
 */
export function parseItems(raw: unknown): OrderItemInput[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_LINES) return null;
  const items: OrderItemInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { productId, options, quantity } = entry as Record<string, unknown>;
    if (typeof productId !== "string" || productId.length === 0 || productId.length > 64) return null;
    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QUANTITY_PER_LINE
    )
      return null;
    if (typeof options !== "object" || options === null || Array.isArray(options)) return null;
    const cleanOptions: SelectedOptions = {};
    const optionEntries = Object.entries(options as Record<string, unknown>);
    if (optionEntries.length > 10) return null;
    for (const [name, value] of optionEntries) {
      if (typeof value !== "string" || name.length > 64 || value.length > 64) return null;
      cleanOptions[name] = value;
    }
    items.push({ productId, options: cleanOptions, quantity });
  }
  return items;
}

/** Chênh lệch giá của bộ biến thể; null nếu lựa chọn không khớp với sản phẩm. */
function variantDelta(product: Product, options: SelectedOptions): number | null {
  const groups = product.variants ?? [];
  if (Object.keys(options).length !== groups.length) return null;
  let delta = 0;
  for (const group of groups) {
    const option = group.options.find((o) => o.label === options[group.name]);
    if (!option) return null;
    delta += option.priceDelta ?? 0;
  }
  return delta;
}

export function calculateShipping(subtotal: number): { fee: number; label: string } {
  void subtotal; // Chưa có chính sách theo giá trị đơn.
  return { fee: siteConfig.shipping.fee, label: siteConfig.shipping.label };
}

/**
 * Tính giá hoàn toàn từ dữ liệu sản phẩm phía server.
 * Dòng không hợp lệ không được tính tiền và được báo trong `issues`.
 */
export async function priceItems(items: OrderItemInput[]): Promise<Quote> {
  // Gộp các dòng trùng sản phẩm + biến thể.
  const merged = new Map<string, OrderItemInput>();
  for (const item of items) {
    const key = makeCartKey(item.productId, item.options);
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, quantity: existing.quantity + item.quantity } : item);
  }

  const lines: PricedLine[] = [];
  const issues: CartIssue[] = [];

  for (const [key, item] of merged) {
    const product = await getProductById(item.productId);
    if (!product) {
      issues.push({ key, message: "Sản phẩm không còn được bán.", fix: { type: "remove" } });
      continue;
    }
    const delta = variantDelta(product, item.options);
    if (delta === null) {
      issues.push({
        key,
        message: "Phiên bản đã chọn (màu, size…) không còn tồn tại.",
        fix: { type: "remove" },
      });
      continue;
    }
    if (product.stock <= 0) {
      issues.push({ key, message: "Sản phẩm đã hết hàng.", fix: { type: "remove" } });
      continue;
    }
    if (item.quantity > product.stock) {
      issues.push({
        key,
        message: `Chỉ còn ${product.stock} sản phẩm, vui lòng giảm số lượng.`,
        fix: { type: "set-quantity", quantity: product.stock },
      });
      continue;
    }

    const unitPrice = product.price + delta;
    lines.push({
      key,
      productId: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      options: item.options,
      unitPrice,
      quantity: item.quantity,
      lineTotal: unitPrice * item.quantity,
      image: product.image,
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const shipping = calculateShipping(subtotal);
  return {
    lines,
    issues,
    subtotal,
    shippingFee: shipping.fee,
    shippingLabel: shipping.label,
    total: subtotal + shipping.fee,
  };
}
