import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_PAGES } from "@/lib/content/defaults";
import { DEFAULT_SETTINGS, SETTING_KEYS } from "@/lib/content/settings";

/**
 * Chèn cài đặt và trang nội dung mặc định cho những mục CHƯA có trong CSDL.
 * Chạy mỗi lần mở CSDL nhưng không bao giờ ghi đè nội dung đã có (ON CONFLICT DO NOTHING),
 * nên khởi động lại không làm mất chỉnh sửa của quản trị.
 */
export function seedSiteContent(db: DatabaseSync): void {
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const setting = db.prepare(
      "INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, 'khoi-tao') ON CONFLICT(key) DO NOTHING",
    );
    for (const key of SETTING_KEYS) setting.run(key, DEFAULT_SETTINGS[key], now);

    const page = db.prepare(
      `INSERT INTO content_pages (slug, title, body, is_public, published_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, 'khoi-tao') ON CONFLICT(slug) DO NOTHING`,
    );
    for (const p of DEFAULT_PAGES) page.run(p.slug, p.title, p.body, p.isPublic ? 1 : 0, p.isPublic ? now : null, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
