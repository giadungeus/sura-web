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

  // v3: danh mục, sản phẩm, biến thể (SKU/giá/tồn kho), ảnh; theo dõi trừ/hoàn kho của đơn
  `
  CREATE TABLE categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT    NOT NULL UNIQUE,
    name            TEXT    NOT NULL,
    description     TEXT    NOT NULL DEFAULT '',
    icon            TEXT    NOT NULL DEFAULT 'shopping-bag',
    parent_id       INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
    attributes_json TEXT    NOT NULL DEFAULT '[]',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_visible      INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
  );
  CREATE INDEX idx_categories_parent ON categories(parent_id, sort_order);

  CREATE TABLE products (
    id                TEXT    PRIMARY KEY,
    slug              TEXT    NOT NULL UNIQUE,
    name              TEXT    NOT NULL,
    brand             TEXT    NOT NULL DEFAULT '',
    category_id       INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    short_description TEXT    NOT NULL DEFAULT '',
    description       TEXT    NOT NULL DEFAULT '',
    highlights_json   TEXT    NOT NULL DEFAULT '[]',
    specs_json        TEXT    NOT NULL DEFAULT '{}',
    tags_json         TEXT    NOT NULL DEFAULT '[]',
    option_names_json TEXT    NOT NULL DEFAULT '[]',
    rating            REAL    NOT NULL DEFAULT 0,
    review_count      INTEGER NOT NULL DEFAULT 0,
    sold              INTEGER NOT NULL DEFAULT 0,
    placeholder_tone  TEXT    NOT NULL DEFAULT 'slate',
    placeholder_icon  TEXT    NOT NULL DEFAULT 'shopping-bag',
    is_visible        INTEGER NOT NULL DEFAULT 1,
    search_text       TEXT    NOT NULL DEFAULT '',
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL
  );
  CREATE INDEX idx_products_category ON products(category_id);
  CREATE INDEX idx_products_created ON products(created_at);

  -- Sản phẩm không biến thể có đúng một dòng với options_json = '{}'.
  CREATE TABLE product_variants (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id       TEXT    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku              TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    options_json     TEXT    NOT NULL DEFAULT '{}',
    options_key      TEXT    NOT NULL DEFAULT '',
    price            INTEGER NOT NULL CHECK (price >= 0),
    compare_at_price INTEGER CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
    stock            INTEGER NOT NULL CHECK (stock >= 0),
    position         INTEGER NOT NULL DEFAULT 0,
    is_active        INTEGER NOT NULL DEFAULT 1,
    UNIQUE (product_id, options_key)
  );
  CREATE INDEX idx_product_variants_product ON product_variants(product_id, position);

  -- Ảnh vừa tải lên có product_id NULL cho tới khi lưu sản phẩm.
  CREATE TABLE product_images (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  TEXT    REFERENCES products(id) ON DELETE SET NULL,
    file_name   TEXT    NOT NULL UNIQUE,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    size_bytes  INTEGER NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    is_primary  INTEGER NOT NULL DEFAULT 0,
    uploaded_by TEXT,
    created_at  TEXT    NOT NULL
  );
  CREATE INDEX idx_product_images_product ON product_images(product_id, position);

  -- Liên kết dòng hàng với biến thể để hoàn kho. Đơn cũ để NULL.
  ALTER TABLE order_items ADD COLUMN variant_id INTEGER;
  ALTER TABLE order_items ADD COLUMN sku TEXT;
  -- 1 = đơn đã trừ kho khi đặt; đơn cũ = 0 nên không bao giờ bị hoàn kho tự động.
  ALTER TABLE orders ADD COLUMN stock_applied INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE orders ADD COLUMN stock_restored_at TEXT;
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
