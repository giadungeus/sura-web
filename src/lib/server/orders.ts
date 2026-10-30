import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { CustomerInput } from "@/lib/checkout/customer";
import type { PricedLine } from "@/lib/checkout/types";
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

/**
 * Lưu đơn trong một giao dịch. Nếu `idempotencyKey` đã tồn tại (bấm nhiều lần,
 * gửi lại sau lỗi mạng) thì trả về đơn đã có, không tạo đơn mới.
 */
export function createOrder(order: NewOrder): { code: string; created: boolean } {
  return withTransaction((db) => {
    const existing = db
      .prepare("SELECT code FROM orders WHERE idempotency_key = ?")
      .get(order.idempotencyKey) as { code: string } | undefined;
    if (existing) return { code: existing.code, created: false };

    const now = new Date();
    const insertOrder = db.prepare(`
      INSERT INTO orders (code, idempotency_key, status, customer_name, phone, address, note,
                          payment_method, subtotal, shipping_fee, total, created_at, updated_at)
      VALUES (?, ?, 'cho_xac_nhan', ?, ?, ?, ?, 'COD', ?, ?, ?, ?, ?)
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

    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_slug, product_name, brand,
                               options_json, image_json, unit_price, quantity, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
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
      );
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
  items: {
    productId: string;
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
    items: items.map((item) => ({
      productId: item.product_id,
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
