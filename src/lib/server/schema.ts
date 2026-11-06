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

  // v4: nhập hàng loạt từ CSV (nguồn hàng/mã sản phẩm, giá nhập nội bộ, nguồn ảnh, lượt nhập)
  `
  -- Nhận diện sản phẩm theo nguồn hàng + mã sản phẩm của nguồn (vd. techmall + BS-PB-001).
  ALTER TABLE products ADD COLUMN source TEXT;
  ALTER TABLE products ADD COLUMN source_code TEXT;
  CREATE UNIQUE INDEX idx_products_source ON products(source, source_code) WHERE source IS NOT NULL;

  -- Giá nhập đại lý: CHỈ dùng trong quản trị, không bao giờ được đọc ra cửa hàng.
  ALTER TABLE product_variants ADD COLUMN cost_price INTEGER CHECK (cost_price IS NULL OR cost_price >= 0);

  -- URL gốc của ảnh tải về khi nhập (để nhập lại không tải trùng).
  ALTER TABLE product_images ADD COLUMN source_url TEXT;
  CREATE INDEX idx_product_images_source_url ON product_images(product_id, source_url);

  CREATE TABLE import_batches (
    id             TEXT PRIMARY KEY,
    admin_username TEXT NOT NULL,
    file_name      TEXT NOT NULL,
    file_sha256    TEXT NOT NULL,
    rows_json      TEXT NOT NULL,
    download_images INTEGER NOT NULL DEFAULT 1,
    status         TEXT NOT NULL DEFAULT 'preview',
    summary_json   TEXT,
    result_json    TEXT,
    created_at     TEXT NOT NULL,
    completed_at   TEXT
  );
  `,

  // v5: hàng đợi tải ảnh khi nhập CSV (xử lý từng lượt ngắn, thử lại an toàn)
  `
  -- Một URL chỉ gắn một lần vào mỗi sản phẩm (chặn ảnh trùng khi thử lại/nhập lại).
  CREATE UNIQUE INDEX idx_product_images_unique_source ON product_images(product_id, source_url)
    WHERE source_url IS NOT NULL AND product_id IS NOT NULL;

  CREATE TABLE import_image_jobs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id      TEXT    NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    product_id    TEXT    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    product_label TEXT    NOT NULL,
    url           TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'pending',  -- pending | done | failed
    attempts      INTEGER NOT NULL DEFAULT 0,
    message       TEXT,
    locked_until  TEXT,                                 -- đang có lượt xử lý giữ ảnh này tới thời điểm này
    updated_at    TEXT    NOT NULL,
    UNIQUE (batch_id, product_id, url)
  );
  CREATE INDEX idx_import_image_jobs_batch ON import_image_jobs(batch_id, status);
  `,

  // v6: cài đặt website, trang nội dung (giới thiệu, chính sách…) và tin tức sửa trong quản trị.
  // Chỉ thêm bảng mới; nội dung mặc định được chèn riêng (site-content-seed.ts) khi CHƯA có.
  `
  CREATE TABLE site_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  );

  -- title/body: bản khách đang thấy (khi is_public = 1).
  -- draft_title/draft_body: bản nháp chưa công khai của trang ĐANG công khai (NULL = không có).
  CREATE TABLE content_pages (
    slug         TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    body         TEXT NOT NULL DEFAULT '',
    draft_title  TEXT,
    draft_body   TEXT,
    is_public    INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    updated_at   TEXT NOT NULL,
    updated_by   TEXT
  );

  -- Tương tự: các cột chính là bản công khai; draft_json là bản nháp của bài đã từng công khai.
  CREATE TABLE news_posts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    slug         TEXT NOT NULL UNIQUE,
    title        TEXT NOT NULL,
    summary      TEXT NOT NULL DEFAULT '',
    body         TEXT NOT NULL DEFAULT '',
    cover_file   TEXT,
    draft_json   TEXT,
    is_public    INTEGER NOT NULL DEFAULT 0,
    published_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    updated_by   TEXT
  );
  CREATE INDEX idx_news_posts_public ON news_posts(is_public, published_at);
  `,

  // v7: nhập gói nội dung ZIP — ảnh trong bài, lượt nhập gói, bản nháp bài sản phẩm, alt ảnh sản phẩm.
  // Chỉ thêm bảng/cột; không sửa dữ liệu cũ.
  `
  -- Ảnh dùng trong thân bài và ảnh bìa tin tức (không thuộc bộ ảnh sản phẩm).
  -- Cùng ảnh gốc (SHA-256) + cùng vai trò chỉ lưu một lần.
  CREATE TABLE content_images (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name     TEXT    NOT NULL UNIQUE,
    source_sha256 TEXT    NOT NULL,
    variant       TEXT    NOT NULL,            -- 'bai' (trong bài) | 'bia' (ảnh bìa)
    width         INTEGER NOT NULL,
    height        INTEGER NOT NULL,
    size_bytes    INTEGER NOT NULL,
    uploaded_by   TEXT,
    created_at    TEXT    NOT NULL,
    UNIQUE (source_sha256, variant)
  );

  -- Lượt nhập gói: ZIP tạm nằm ở .data/goi-tam/<id>.zip tới khi nhập xong/bỏ/hết hạn.
  CREATE TABLE package_imports (
    id             TEXT PRIMARY KEY,
    admin_username TEXT NOT NULL,
    file_name      TEXT NOT NULL,
    file_sha256    TEXT NOT NULL,
    package_name   TEXT,
    manifest_json  TEXT NOT NULL,              -- gói đã kiểm tra (đã chuẩn hoá)
    status         TEXT NOT NULL DEFAULT 'staging', -- staging | applied | cancelled
    result_json    TEXT,
    created_at     TEXT NOT NULL,
    completed_at   TEXT
  );

  -- Ảnh của lượt nhập, xử lý theo lượt ngắn. target: 'bai' | 'bia' | 'sp:<product id>'.
  CREATE TABLE package_import_images (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id      TEXT    NOT NULL REFERENCES package_imports(id) ON DELETE CASCADE,
    zip_path      TEXT    NOT NULL,
    source_sha256 TEXT    NOT NULL,
    target        TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'pending', -- pending | done | failed
    attempts      INTEGER NOT NULL DEFAULT 0,
    locked_until  TEXT,
    file_name     TEXT,
    width         INTEGER,
    height        INTEGER,
    size_bytes    INTEGER,
    reused        INTEGER NOT NULL DEFAULT 0,  -- 1 = dùng lại tệp đã có, không phải tệp mới
    over_target   INTEGER NOT NULL DEFAULT 0,
    message       TEXT,
    updated_at    TEXT    NOT NULL,
    UNIQUE (batch_id, source_sha256, target)
  );
  CREATE INDEX idx_package_import_images_batch ON package_import_images(batch_id, status);

  -- Bản nháp bài sản phẩm (từ gói nội dung): khách vẫn thấy bài cũ tới khi áp dụng.
  ALTER TABLE products ADD COLUMN content_draft_json TEXT;
  -- Văn bản thay thế cho ảnh sản phẩm (NULL = dùng tên sản phẩm như trước).
  ALTER TABLE product_images ADD COLUMN alt TEXT;
  -- Văn bản thay thế cho ảnh đại diện tin tức.
  ALTER TABLE news_posts ADD COLUMN cover_alt TEXT;
  `,

  // v8: SEO — tiêu đề/mô tả SEO tuỳ chọn (NULL = dùng mặc định), thời điểm bản công khai thay đổi,
  // đánh dấu “từng công khai” để khoá slug. Chỉ thêm cột; không sửa nội dung cũ.
  // public_updated_at để NULL cho dữ liệu cũ (không có căn cứ biết lần sửa công khai gần nhất);
  // public_fingerprint được điền lần đầu khi khởi động mà không đổi public_updated_at.
  `
  ALTER TABLE products ADD COLUMN seo_title TEXT;
  ALTER TABLE products ADD COLUMN seo_description TEXT;
  ALTER TABLE products ADD COLUMN public_updated_at TEXT;
  ALTER TABLE products ADD COLUMN public_fingerprint TEXT;
  ALTER TABLE products ADD COLUMN ever_public INTEGER NOT NULL DEFAULT 0;
  UPDATE products SET ever_public = 1 WHERE is_visible = 1;

  ALTER TABLE categories ADD COLUMN seo_title TEXT;
  ALTER TABLE categories ADD COLUMN seo_description TEXT;
  ALTER TABLE categories ADD COLUMN public_updated_at TEXT;
  ALTER TABLE categories ADD COLUMN public_fingerprint TEXT;
  ALTER TABLE categories ADD COLUMN ever_public INTEGER NOT NULL DEFAULT 0;
  UPDATE categories SET ever_public = 1 WHERE is_visible = 1;

  ALTER TABLE news_posts ADD COLUMN seo_title TEXT;
  ALTER TABLE news_posts ADD COLUMN seo_description TEXT;
  ALTER TABLE news_posts ADD COLUMN public_updated_at TEXT;
  ALTER TABLE news_posts ADD COLUMN public_fingerprint TEXT;

  ALTER TABLE content_pages ADD COLUMN seo_title TEXT;
  ALTER TABLE content_pages ADD COLUMN seo_description TEXT;
  -- SEO của bản nháp (JSON {"seoTitle","seoDescription"}); NULL = bản nháp không đổi SEO.
  ALTER TABLE content_pages ADD COLUMN draft_seo_json TEXT;
  ALTER TABLE content_pages ADD COLUMN public_updated_at TEXT;
  ALTER TABLE content_pages ADD COLUMN public_fingerprint TEXT;
  `,

  // v9: nội dung chi tiết danh mục + bản nháp (mô tả ngắn, nội dung, SEO). Chỉ thêm cột; dữ liệu công khai giữ nguyên,
  // không tạo nội dung hay bản nháp. Dấu vết công khai của danh mục được tính lại khi khởi động (thêm `body`)
  // mà KHÔNG đổi public_updated_at — đây là dữ liệu dẫn xuất, không phải dữ liệu kinh doanh.
  `
  ALTER TABLE categories ADD COLUMN body TEXT NOT NULL DEFAULT '';
  -- JSON {"description","body","seoTitle","seoDescription"}; NULL = không có bản nháp.
  ALTER TABLE categories ADD COLUMN draft_json TEXT;
  UPDATE categories SET public_fingerprint = NULL;
  `,

  // v10: chatbot tư vấn — CHỈ thêm bảng thống kê/giới hạn lượt. Không lưu nội dung hội thoại hay IP gốc
  // (định danh phiên/IP là HMAC). Không đụng dữ liệu kinh doanh.
  `
  -- Ngân sách & thống kê theo ngày (giờ Việt Nam). Tiền tính bằng micro-USD (1 USD = 1.000.000).
  CREATE TABLE chat_budget_daily (
    day            TEXT PRIMARY KEY,
    reserved_micro INTEGER NOT NULL DEFAULT 0,
    spent_micro    INTEGER NOT NULL DEFAULT 0,
    questions      INTEGER NOT NULL DEFAULT 0,
    api_calls      INTEGER NOT NULL DEFAULT 0,
    quick_answers  INTEGER NOT NULL DEFAULT 0,
    blocked        INTEGER NOT NULL DEFAULT 0,
    errors         INTEGER NOT NULL DEFAULT 0,
    input_tokens   INTEGER NOT NULL DEFAULT 0,
    output_tokens  INTEGER NOT NULL DEFAULT 0,
    updated_at     TEXT NOT NULL
  );
  -- Bộ đếm cửa sổ cố định (phiên/IP/câu lặp/đã qua CAPTCHA); tự xoá khi hết hạn.
  CREATE TABLE chat_rate (
    bucket     TEXT    NOT NULL,
    subject    TEXT    NOT NULL,
    window     INTEGER NOT NULL,
    count      INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (bucket, subject, window)
  );
  CREATE INDEX idx_chat_rate_expires ON chat_rate(expires_at);
  -- Yêu cầu đang xử lý: mỗi phiên tối đa 1, toàn website tối đa N; khoá tự hết hạn nếu tiến trình chết.
  CREATE TABLE chat_inflight (
    subject    TEXT    PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );
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
