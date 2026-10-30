import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { normalizePhone } from "@/lib/checkout/customer";
import {
  CANCEL_REASON_LIMITS,
  INTERNAL_NOTE_MAX,
  ORDER_STATUSES,
  STATUS_LABELS,
  canTransition,
  isOrderStatus,
  type OrderStatus,
} from "@/lib/order-status";
import { getDb, withTransaction } from "@/lib/server/db";
import { ORDER_CODE_PATTERN, getOrderByCode, type StoredOrder } from "@/lib/server/orders";

export const ADMIN_PAGE_SIZE = 20;

// ───────────── Danh sách ─────────────

export type AdminOrderListItem = {
  code: string;
  createdAt: string;
  customerName: string;
  phone: string;
  total: number;
  itemCount: number;
  status: OrderStatus;
};

export type AdminOrderQuery = { q?: string; status?: OrderStatus; page?: number };

/** Điều kiện tìm theo mã đơn (một phần) hoặc số điện thoại (một phần). */
function buildWhere(query: AdminOrderQuery): { sql: string; params: string[] } {
  const clauses: string[] = [];
  const params: string[] = [];
  const q = query.q?.trim().slice(0, 50);
  if (q) {
    const codePart = q.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const phonePart = /\d/.test(q) ? normalizePhone(q).replace(/\D/g, "") : "";
    const ors: string[] = [];
    if (codePart) {
      ors.push("o.code LIKE ? ESCAPE '\\'");
      params.push(`%${codePart}%`);
    }
    if (phonePart.length >= 3) {
      ors.push("o.phone LIKE ?");
      params.push(`%${phonePart}%`);
    }
    clauses.push(ors.length ? `(${ors.join(" OR ")})` : "0");
  }
  if (query.status) {
    clauses.push("o.status = ?");
    params.push(query.status);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export function listAdminOrders(query: AdminOrderQuery): {
  items: AdminOrderListItem[];
  total: number;
  page: number;
  totalPages: number;
} {
  const db = getDb();
  const where = buildWhere(query);
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM orders o ${where.sql}`).get(...where.params) as { n: number }).n;
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page ?? 1), totalPages);

  const rows = db
    .prepare(
      `SELECT o.code, o.created_at, o.customer_name, o.phone, o.total, o.status,
              (SELECT COALESCE(SUM(quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS item_count
       FROM orders o ${where.sql}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...where.params, ADMIN_PAGE_SIZE, (page - 1) * ADMIN_PAGE_SIZE) as {
    code: string;
    created_at: string;
    customer_name: string;
    phone: string;
    total: number;
    status: string;
    item_count: number;
  }[];

  return {
    total,
    page,
    totalPages,
    items: rows.map((r) => ({
      code: r.code,
      createdAt: r.created_at,
      customerName: r.customer_name,
      phone: r.phone,
      total: r.total,
      itemCount: r.item_count,
      status: isOrderStatus(r.status) ? r.status : "cho_xac_nhan",
    })),
  };
}

/** Số đơn theo từng trạng thái (cho các nút lọc), áp dụng cùng từ khoá tìm kiếm. */
export function countOrdersByStatus(q?: string): Record<OrderStatus | "all", number> {
  const db = getDb();
  const where = buildWhere({ q });
  const rows = db
    .prepare(`SELECT o.status, COUNT(*) AS n FROM orders o ${where.sql} GROUP BY o.status`)
    .all(...where.params) as { status: string; n: number }[];
  const counts = Object.fromEntries([...ORDER_STATUSES, "all"].map((s) => [s, 0])) as Record<OrderStatus | "all", number>;
  for (const row of rows) {
    if (isOrderStatus(row.status)) counts[row.status] = row.n;
    counts.all += row.n;
  }
  return counts;
}

// ───────────── Chi tiết ─────────────

export type StatusHistoryEntry = {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  reason: string;
  adminUsername: string | null;
  createdAt: string;
};

export type InternalNote = { body: string; adminUsername: string; createdAt: string };

export type AdminOrderDetail = StoredOrder & {
  updatedAt: string;
  history: StatusHistoryEntry[];
  internalNotes: InternalNote[];
};

export function getAdminOrder(code: string): AdminOrderDetail | null {
  const order = getOrderByCode(code);
  if (!order) return null;
  const db = getDb();
  const meta = db.prepare("SELECT id, updated_at FROM orders WHERE code = ?").get(code) as {
    id: number;
    updated_at: string | null;
  };
  const history = db
    .prepare(
      `SELECT from_status, to_status, reason, admin_username, created_at
       FROM order_status_history WHERE order_id = ? ORDER BY created_at, id`,
    )
    .all(meta.id) as {
    from_status: string | null;
    to_status: string;
    reason: string;
    admin_username: string | null;
    created_at: string;
  }[];
  const notes = db
    .prepare(
      `SELECT body, admin_username, created_at FROM order_internal_notes
       WHERE order_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .all(meta.id) as { body: string; admin_username: string; created_at: string }[];

  return {
    ...order,
    updatedAt: meta.updated_at ?? order.createdAt,
    history: history
      .filter((h) => isOrderStatus(h.to_status))
      .map((h) => ({
        fromStatus: isOrderStatus(h.from_status) ? h.from_status : null,
        toStatus: h.to_status as OrderStatus,
        reason: h.reason,
        adminUsername: h.admin_username,
        createdAt: h.created_at,
      })),
    internalNotes: notes.map((n) => ({ body: n.body, adminUsername: n.admin_username, createdAt: n.created_at })),
  };
}

// ───────────── Thay đổi dữ liệu ─────────────

export type MutationResult = { ok: true; message: string } | { ok: false; message: string };

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max + 1);
}

/**
 * Chuyển trạng thái đơn. Kiểm tra trên server: đơn tồn tại, trạng thái hiện tại
 * khớp với trạng thái người quản trị đang thấy (tránh bấm hai lần / hai tab),
 * và bước chuyển nằm trong luồng cho phép.
 */
export function changeOrderStatus(input: {
  code: unknown;
  expectedStatus: unknown;
  toStatus: unknown;
  reason: unknown;
  adminUsername: string;
}): MutationResult {
  const code = typeof input.code === "string" ? input.code.toUpperCase() : "";
  if (!ORDER_CODE_PATTERN.test(code)) return { ok: false, message: "Mã đơn không hợp lệ." };
  if (!isOrderStatus(input.expectedStatus) || !isOrderStatus(input.toStatus)) {
    return { ok: false, message: "Trạng thái không hợp lệ." };
  }
  const expected = input.expectedStatus;
  const to = input.toStatus;
  const reason = cleanText(input.reason, CANCEL_REASON_LIMITS.max);

  if (to === "da_huy") {
    if (reason.length < CANCEL_REASON_LIMITS.min) {
      return { ok: false, message: `Vui lòng nhập lý do huỷ (ít nhất ${CANCEL_REASON_LIMITS.min} ký tự).` };
    }
    if (reason.length > CANCEL_REASON_LIMITS.max) {
      return { ok: false, message: `Lý do huỷ tối đa ${CANCEL_REASON_LIMITS.max} ký tự.` };
    }
  }

  return withTransaction((db) => {
    const row = db.prepare("SELECT id, status FROM orders WHERE code = ?").get(code) as
      | { id: number; status: string }
      | undefined;
    if (!row) return { ok: false, message: "Không tìm thấy đơn hàng." };
    const current = isOrderStatus(row.status) ? row.status : "cho_xac_nhan";
    if (current !== expected) {
      return {
        ok: false,
        message: `Đơn vừa được cập nhật ở nơi khác (hiện tại: ${STATUS_LABELS[current]}). Trang đã được làm mới, vui lòng kiểm tra lại.`,
      };
    }
    if (!canTransition(current, to)) {
      return {
        ok: false,
        message:
          to === "da_huy"
            ? `Không thể huỷ đơn ở trạng thái “${STATUS_LABELS[current]}”. Chỉ huỷ được trước khi giao.`
            : `Không thể chuyển từ “${STATUS_LABELS[current]}” sang “${STATUS_LABELS[to]}”.`,
      };
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(to, now, row.id);
    db.prepare(
      `INSERT INTO order_status_history (order_id, from_status, to_status, reason, admin_username, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(row.id, current, to, to === "da_huy" ? reason : "", input.adminUsername, now);

    if (to === "da_huy") {
      const restored = restoreStock(db, row.id, now);
      if (restored > 0) {
        return { ok: true, message: `Đã huỷ đơn và hoàn ${restored} sản phẩm vào kho.` };
      }
    }
    return { ok: true, message: `Đã chuyển đơn sang “${STATUS_LABELS[to]}”.` };
  });
}

/**
 * Hoàn kho cho đơn bị huỷ. Chỉ áp dụng cho đơn đã trừ kho lúc đặt (stock_applied = 1)
 * và chưa hoàn lần nào (stock_restored_at IS NULL) — nên mỗi đơn hoàn đúng một lần.
 * Đơn thử nghiệm cũ (trước khi có quản lý kho) không bị đụng tới.
 * Gọi bên trong giao dịch của thao tác huỷ.
 */
function restoreStock(db: DatabaseSync, orderId: number, now: string): number {
  const claim = db
    .prepare("UPDATE orders SET stock_restored_at = ? WHERE id = ? AND stock_applied = 1 AND stock_restored_at IS NULL")
    .run(now, orderId);
  if (claim.changes !== 1) return 0;

  const items = db
    .prepare("SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ? AND variant_id IS NOT NULL")
    .all(orderId) as { product_id: string; variant_id: number; quantity: number }[];
  const addStock = db.prepare("UPDATE product_variants SET stock = stock + ? WHERE id = ?");
  const subSold = db.prepare("UPDATE products SET sold = MAX(sold - ?, 0) WHERE id = ?");
  let restored = 0;
  for (const item of items) {
    // Biến thể đã bị xoá khỏi CSDL thì không còn chỗ để hoàn (biến thể có đơn chỉ bị ẩn, không bị xoá).
    restored += addStock.run(item.quantity, item.variant_id).changes ? item.quantity : 0;
    subSold.run(item.quantity, item.product_id);
  }
  return restored;
}

export function addInternalNote(input: { code: unknown; body: unknown; adminUsername: string }): MutationResult {
  const code = typeof input.code === "string" ? input.code.toUpperCase() : "";
  if (!ORDER_CODE_PATTERN.test(code)) return { ok: false, message: "Mã đơn không hợp lệ." };
  const body = cleanText(input.body, INTERNAL_NOTE_MAX);
  if (!body) return { ok: false, message: "Vui lòng nhập nội dung ghi chú." };
  if (body.length > INTERNAL_NOTE_MAX) return { ok: false, message: `Ghi chú tối đa ${INTERNAL_NOTE_MAX} ký tự.` };

  return withTransaction((db) => {
    const row = db.prepare("SELECT id FROM orders WHERE code = ?").get(code) as { id: number } | undefined;
    if (!row) return { ok: false, message: "Không tìm thấy đơn hàng." };
    db.prepare(
      "INSERT INTO order_internal_notes (order_id, body, admin_username, created_at) VALUES (?, ?, ?, ?)",
    ).run(row.id, body, input.adminUsername, new Date().toISOString());
    return { ok: true, message: "Đã thêm ghi chú nội bộ." };
  });
}
