/**
 * Cấu trúc CSDL và migration. Module thuần (không import alias, không "server-only")
 * để dùng chung cho ứng dụng Next.js và script `npm run admin:setup`.
 *
 * Quy tắc: không sửa migration đã chạy; muốn đổi cấu trúc thì thêm phần tử mới.
 */
import type { DatabaseSync } from "node:sqlite";

export const MIGRATIONS: string[] = [
  // v1: đơn hàng và dòng hàng
  `
  CREATE TABLE app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    NOT NULL UNIQUE,
    idempotency_key TEXT    NOT NULL UNIQUE,
    status          TEXT    NOT NULL DEFAULT 'thu_nghiem',
    is_test         INTEGER NOT NULL DEFAULT 1,
    customer_name   TEXT    NOT NULL,
    phone           TEXT    NOT NULL,
    address         TEXT    NOT NULL,
    note            TEXT    NOT NULL DEFAULT '',
    payment_method  TEXT    NOT NULL DEFAULT 'COD',
    subtotal        INTEGER NOT NULL,
    shipping_fee    INTEGER NOT NULL,
    total           INTEGER NOT NULL,
    created_at      TEXT    NOT NULL
  );

  CREATE TABLE order_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id   TEXT    NOT NULL,
    product_slug TEXT    NOT NULL,
    product_name TEXT    NOT NULL,
    brand        TEXT    NOT NULL,
    options_json TEXT    NOT NULL,
    image_json   TEXT    NOT NULL,
    unit_price   INTEGER NOT NULL,
    quantity     INTEGER NOT NULL,
    line_total   INTEGER NOT NULL
  );

  CREATE INDEX idx_order_items_order_id ON order_items(order_id);
  `,

  // v2: quản trị viên, phiên đăng nhập, giới hạn đăng nhập, trạng thái đơn, ghi chú nội bộ
  `
  CREATE TABLE admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );

  -- Chỉ lưu SHA-256 của mã phiên; mã phiên gốc chỉ nằm trong cookie httpOnly.
  CREATE TABLE admin_sessions (
    token_hash   TEXT PRIMARY KEY,
    admin_id     INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at   TEXT NOT NULL
  );
  CREATE INDEX idx_admin_sessions_admin_id ON admin_sessions(admin_id);

  CREATE TABLE login_attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT    NOT NULL,
    ip           TEXT    NOT NULL,
    success      INTEGER NOT NULL,
    attempted_at TEXT    NOT NULL
  );
  CREATE INDEX idx_login_attempts_time ON login_attempts(attempted_at);

  CREATE TABLE order_status_history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status    TEXT,
    to_status      TEXT    NOT NULL,
    reason         TEXT    NOT NULL DEFAULT '',
    admin_username TEXT,
    created_at     TEXT    NOT NULL
  );
  CREATE INDEX idx_order_status_history_order_id ON order_status_history(order_id);

  CREATE TABLE order_internal_notes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    body           TEXT    NOT NULL,
    admin_username TEXT    NOT NULL,
    created_at     TEXT    NOT NULL
  );
  CREATE INDEX idx_order_internal_notes_order_id ON order_internal_notes(order_id);

  ALTER TABLE orders ADD COLUMN updated_at TEXT;
  UPDATE orders SET updated_at = created_at;

  -- Đơn cũ (giai đoạn 2) chuyển sang trạng thái đầu tiên của luồng xử lý.
  UPDATE orders SET status = 'cho_xac_nhan' WHERE status = 'thu_nghiem';
  INSERT INTO order_status_history (order_id, from_status, to_status, reason, admin_username, created_at)
    SELECT id, NULL, 'cho_xac_nhan', 'Khách đặt hàng', NULL, created_at FROM orders;

  CREATE INDEX idx_orders_status_created ON orders(status, created_at);
  CREATE INDEX idx_orders_created ON orders(created_at);
  CREATE INDEX idx_orders_phone ON orders(phone);
  `,
];

export function migrate(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let version = row.user_version; version < MIGRATIONS.length; version++) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export function configure(db: DatabaseSync): void {
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
}
