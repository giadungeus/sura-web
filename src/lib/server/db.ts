import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Cơ sở dữ liệu SQLite (module `node:sqlite` có sẵn trong Node.js, không cần cài thêm).
 * Mặc định lưu tại `.data/shop.sqlite` trong thư mục dự án; đổi bằng biến môi trường SHOP_DB_PATH.
 */
export function getDbPath(): string {
  return process.env.SHOP_DB_PATH || path.join(process.cwd(), ".data", "shop.sqlite");
}

const MIGRATIONS: string[] = [
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
];

function migrate(db: DatabaseSync) {
  const row = db.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let version = row.user_version; version < MIGRATIONS.length; version++) {
    db.exec("BEGIN");
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

// Giữ một kết nối duy nhất, kể cả khi dev server nạp lại module.
const globalForDb = globalThis as unknown as { __shopDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!globalForDb.__shopDb) {
    const dbPath = getDbPath();
    mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    migrate(db);
    globalForDb.__shopDb = db;
  }
  return globalForDb.__shopDb;
}

/** Chạy `fn` trong một giao dịch ghi; tự ROLLBACK nếu lỗi. */
export function withTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
