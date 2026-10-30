import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { siteConfig } from "@/config/site";
import { makeCartKey, optionsKey } from "@/lib/cart-key";
import type { CartIssue, OrderItemInput, PricedLine, Quote } from "@/lib/checkout/types";
import { imageUrl } from "@/lib/data/catalog";
import { getDb } from "@/lib/server/db";
import type { IconKey, SelectedOptions, Tone } from "@/types";

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
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_LINE)
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

export function calculateShipping(subtotal: number): { fee: number; label: string } {
  void subtotal; // Chưa có chính sách theo giá trị đơn.
  return { fee: siteConfig.shipping.fee, label: siteConfig.shipping.label };
}

/** Sản phẩm được phép bán: đang hiển thị và mọi danh mục cha đều đang hiển thị. */
export function isProductPurchasable(db: DatabaseSync, productId: string): boolean {
  const row = db
    .prepare(
      `WITH RECURSIVE chain(id, parent_id, is_visible) AS (
         SELECT c.id, c.parent_id, c.is_visible FROM categories c
           JOIN products p ON p.category_id = c.id WHERE p.id = ? AND p.is_visible = 1
         UNION ALL
         SELECT c.id, c.parent_id, c.is_visible FROM categories c JOIN chain ON c.id = chain.parent_id
       )
       SELECT COUNT(*) AS n, MIN(is_visible) AS ok FROM chain`,
    )
    .get(productId) as { n: number; ok: number | null };
  return row.n > 0 && row.ok === 1;
}

export type VariantForSale = {
  variantId: number;
  sku: string;
  price: number;
  stock: number;
  productId: string;
  slug: string;
  name: string;
  brand: string;
  options: SelectedOptions;
  tone: Tone;
  icon: IconKey;
  imageFile: string | null;
};

/** Tìm biến thể đang bán theo sản phẩm + bộ thuộc tính. */
export function findVariantForSale(db: DatabaseSync, productId: string, options: SelectedOptions): VariantForSale | null {
  const row = db
    .prepare(
      `SELECT v.id, v.sku, v.price, v.stock, v.options_json, p.id AS product_id, p.slug, p.name, p.brand,
              p.placeholder_tone, p.placeholder_icon,
              (SELECT file_name FROM product_images i WHERE i.product_id = p.id
                 ORDER BY is_primary DESC, position, id LIMIT 1) AS image_file
       FROM product_variants v JOIN products p ON p.id = v.product_id
       WHERE v.product_id = ? AND v.options_key = ? AND v.is_active = 1`,
    )
    .get(productId, optionsKey(options)) as
    | {
        id: number;
        sku: string;
        price: number;
        stock: number;
        options_json: string;
        product_id: string;
        slug: string;
        name: string;
        brand: string;
        placeholder_tone: string;
        placeholder_icon: string;
        image_file: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    variantId: row.id,
    sku: row.sku,
    price: row.price,
    stock: row.stock,
    productId: row.product_id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    options: JSON.parse(row.options_json) as SelectedOptions,
    tone: row.placeholder_tone as Tone,
    icon: row.placeholder_icon as IconKey,
    imageFile: row.image_file,
  };
}

/**
 * Tính giá hoàn toàn từ CSDL phía server.
 * Dòng không hợp lệ không được tính tiền và được báo trong `issues`.
 */
export async function priceItems(items: OrderItemInput[]): Promise<Quote> {
  const db = getDb();

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
    if (!isProductPurchasable(db, item.productId)) {
      issues.push({ key, message: "Sản phẩm không còn được bán.", fix: { type: "remove" } });
      continue;
    }
    const variant = findVariantForSale(db, item.productId, item.options);
    if (!variant) {
      issues.push({ key, message: "Phiên bản đã chọn (màu, size…) không còn được bán.", fix: { type: "remove" } });
      continue;
    }
    if (variant.stock <= 0) {
      issues.push({ key, message: "Sản phẩm đã hết hàng.", fix: { type: "remove" } });
      continue;
    }
    if (item.quantity > variant.stock) {
      issues.push({
        key,
        message: `Chỉ còn ${variant.stock} sản phẩm, vui lòng giảm số lượng.`,
        fix: { type: "set-quantity", quantity: variant.stock },
      });
      continue;
    }

    lines.push({
      key,
      productId: variant.productId,
      variantId: variant.variantId,
      sku: variant.sku,
      slug: variant.slug,
      name: variant.name,
      brand: variant.brand,
      options: variant.options,
      unitPrice: variant.price,
      quantity: item.quantity,
      lineTotal: variant.price * item.quantity,
      image: {
        tone: variant.tone,
        icon: variant.icon,
        url: variant.imageFile ? imageUrl(variant.imageFile) : undefined,
      },
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
