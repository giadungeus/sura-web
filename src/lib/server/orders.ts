import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { CustomerInput } from "@/lib/checkout/customer";
import type { CartIssue, PricedLine } from "@/lib/checkout/types";
import { isProductPurchasable } from "@/lib/server/pricing";
import { isOrderStatus, type OrderStatus } from "@/lib/order-status";
import { getDb, withTransaction } from "@/lib/server/db";
import type { ProductImage, SelectedOptions } from "@/types";

export const ORDER_CODE_PATTERN = /^DH\d{6}-[A-Z0-9]{6}$/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bỏ ký tự dễ nhầm: 0/O, 1/I

/** Mã đơn dạng DH261030-K7Q2MX (ngày theo giờ Việt Nam + 6 ký tự ngẫu nhiên). */
function generateOrderCode(now: Date): string {
  const vn = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .replaceAll("-", "");
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `DH${vn}-${suffix}`;
}

export type NewOrder = {
  idempotencyKey: string;
  customer: CustomerInput;
  lines: PricedLine[];
  subtotal: number;
  shippingFee: number;
  total: number;
};

/** Mã đơn đã tạo với khoá chống trùng này (yêu cầu gửi lại sau khi đã thành công). */
export function findOrderCodeByIdempotencyKey(key: string): string | null {
  const row = getDb().prepare("SELECT code FROM orders WHERE idempotency_key = ?").get(key) as
    | { code: string }
    | undefined;
  return row?.code ?? null;
}

/** Lỗi nghiệp vụ khi lưu đơn: giao dịch bị huỷ, không trừ kho, không tạo đơn. */
export class OrderConflictError extends Error {
  constructor(
    readonly kind: "cart" | "price-changed",
    readonly issues: CartIssue[] = [],
  ) {
    super(kind);
  }
}

/**
 * Lưu đơn và trừ kho trong CÙNG một giao dịch (BEGIN IMMEDIATE: chỉ một giao dịch ghi
 * tại một thời điểm, nên các yêu cầu đồng thời không thể cùng mua món cuối cùng).
 *
 * Nếu `idempotencyKey` đã tồn tại (bấm nhiều lần, gửi lại sau lỗi mạng) thì trả về
 * đơn đã có — không tạo đơn mới và không trừ kho lần nữa.
 */
export function createOrder(order: NewOrder): { code: string; created: boolean } {
  return withTransaction((db) => {
    const existing = db
      .prepare("SELECT code FROM orders WHERE idempotency_key = ?")
      .get(order.idempotencyKey) as { code: string } | undefined;
    if (existing) return { code: existing.code, created: false };

    // Kiểm tra lại từng dòng ngay trong giao dịch rồi trừ kho có điều kiện.
    const issues: CartIssue[] = [];
    let priceChanged = false;
    const readVariant = db.prepare(
      "SELECT price, stock, is_active, product_id FROM product_variants WHERE id = ?",
    );
    const decrement = db.prepare(
      "UPDATE product_variants SET stock = stock - ? WHERE id = ? AND is_active = 1 AND stock >= ?",
    );
    for (const line of order.lines) {
      const v = readVariant.get(line.variantId) as
        | { price: number; stock: number; is_active: number; product_id: string }
        | undefined;
      if (!v || !v.is_active || v.product_id !== line.productId || !isProductPurchasable(db, line.productId)) {
        issues.push({ key: line.key, message: "Sản phẩm không còn được bán.", fix: { type: "remove" } });
        continue;
      }
      if (v.price !== line.unitPrice) {
        priceChanged = true;
        continue;
      }
      const r = decrement.run(line.quantity, line.variantId, line.quantity);
      if (r.changes !== 1) {
        issues.push(
          v.stock > 0
            ? {
                key: line.key,
                message: `Chỉ còn ${v.stock} sản phẩm, vui lòng giảm số lượng.`,
                fix: { type: "set-quantity", quantity: v.stock },
              }
            : { key: line.key, message: "Sản phẩm vừa hết hàng.", fix: { type: "remove" } },
        );
      }
    }
    // Ném lỗi để ROLLBACK: mọi lượt trừ kho ở trên đều được hoàn tác.
    if (issues.length > 0) throw new OrderConflictError("cart", issues);
    if (priceChanged) throw new OrderConflictError("price-changed");

    const now = new Date();
    const insertOrder = db.prepare(`
      INSERT INTO orders (code, idempotency_key, status, customer_name, phone, address, note,
                          payment_method, subtotal, shipping_fee, total, created_at, updated_at, stock_applied)
      VALUES (?, ?, 'cho_xac_nhan', ?, ?, ?, ?, 'COD', ?, ?, ?, ?, ?, 1)
    `);

    let code = "";
    let orderId = 0;
    for (let attempt = 0; attempt < 5 && !orderId; attempt++) {
      code = generateOrderCode(now);
      const taken = db.prepare("SELECT 1 FROM orders WHERE code = ?").get(code);
      if (taken) continue;
      const result = insertOrder.run(
        code,
        order.idempotencyKey,
        order.customer.name,
        order.customer.phone,
        order.customer.address,
        order.customer.note,
        order.subtotal,
        order.shippingFee,
        order.total,
        now.toISOString(),
        now.toISOString(),
      );
      orderId = Number(result.lastInsertRowid);
    }
    if (!orderId) throw new Error("Không tạo được mã đơn hàng duy nhất.");

    db.prepare(
      `INSERT INTO order_status_history (order_id, from_status, to_status, reason, admin_username, created_at)
       VALUES (?, NULL, 'cho_xac_nhan', 'Khách đặt hàng', NULL, ?)`,
    ).run(orderId, now.toISOString());

    // Lưu ảnh chụp tên, biến thể, giá tại thời điểm đặt: sửa sản phẩm sau này không đổi đơn cũ.
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_slug, product_name, brand,
                               options_json, image_json, unit_price, quantity, line_total, variant_id, sku)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const addSold = db.prepare("UPDATE products SET sold = sold + ? WHERE id = ?");
    for (const line of order.lines) {
      insertItem.run(
        orderId,
        line.productId,
        line.slug,
        line.name,
        line.brand,
        JSON.stringify(line.options),
        JSON.stringify(line.image),
        line.unitPrice,
        line.quantity,
        line.lineTotal,
        line.variantId,
        line.sku,
      );
      addSold.run(line.quantity, line.productId);
    }
    return { code, created: true };
  });
}

export type StoredOrder = {
  code: string;
  status: OrderStatus;
  isTest: boolean;
  customerName: string;
  phone: string;
  address: string;
  note: string;
  paymentMethod: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  createdAt: string;
  /** Đơn đã trừ kho khi đặt (đơn từ giai đoạn 4). Đơn cũ = false. */
  stockApplied: boolean;
  stockRestoredAt: string | null;
  items: {
    productId: string;
    variantId: number | null;
    sku: string | null;
    slug: string;
    name: string;
    brand: string;
    options: SelectedOptions;
    image: ProductImage;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
};

type OrderRow = {
  id: number;
  code: string;
  status: string;
  is_test: number;
  customer_name: string;
  phone: string;
  address: string;
  note: string;
  payment_method: string;
  subtotal: number;
  shipping_fee: number;
  total: number;
  created_at: string;
  stock_applied: number;
  stock_restored_at: string | null;
};

type ItemRow = {
  product_id: string;
  product_slug: string;
  product_name: string;
  brand: string;
  options_json: string;
  image_json: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  variant_id: number | null;
  sku: string | null;
};

export function getOrderByCode(code: string): StoredOrder | null {
  if (!ORDER_CODE_PATTERN.test(code)) return null;
  const db = getDb();
  const row = db.prepare("SELECT * FROM orders WHERE code = ?").get(code) as OrderRow | undefined;
  if (!row) return null;
  const items = db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id")
    .all(row.id) as ItemRow[];
  return {
    code: row.code,
    status: isOrderStatus(row.status) ? row.status : "cho_xac_nhan",
    isTest: row.is_test === 1,
    customerName: row.customer_name,
    phone: row.phone,
    address: row.address,
    note: row.note,
    paymentMethod: row.payment_method,
    subtotal: row.subtotal,
    shippingFee: row.shipping_fee,
    total: row.total,
    createdAt: row.created_at,
    stockApplied: row.stock_applied === 1,
    stockRestoredAt: row.stock_restored_at,
    items: items.map((item) => ({
      productId: item.product_id,
      variantId: item.variant_id,
      sku: item.sku,
      slug: item.product_slug,
      name: item.product_name,
      brand: item.brand,
      options: JSON.parse(item.options_json) as SelectedOptions,
      image: JSON.parse(item.image_json) as ProductImage,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      lineTotal: item.line_total,
    })),
  };
}

// ───────────── Quyền xem đơn ─────────────
// Chỉ trình duyệt đã đặt đơn mới xem được: server cấp cookie httpOnly chứa
// HMAC(mã đơn) bằng khóa bí mật lưu trong CSDL. Không có trang liệt kê đơn.

export const ORDER_ACCESS_COOKIE_PREFIX = "don_hang_";

function getAccessSecret(): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'order_access_secret'").get() as
    | { value: string }
    | undefined;
  if (row) return row.value;
  const secret = randomBytes(32).toString("hex");
  db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('order_access_secret', ?)").run(
    secret,
  );
  // Đọc lại phòng khi tiến trình khác vừa ghi trước.
  return (
    db.prepare("SELECT value FROM app_settings WHERE key = 'order_access_secret'").get() as {
      value: string;
    }
  ).value;
}

export function createOrderAccessToken(code: string): string {
  return createHmac("sha256", getAccessSecret()).update(code).digest("base64url");
}

export function verifyOrderAccessToken(code: string, token: string | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(createOrderAccessToken(code));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
