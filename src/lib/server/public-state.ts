/**
 * Ghi nhận thời điểm BẢN CÔNG KHAI của một mục thực sự thay đổi (dùng cho lastmod/dateModified).
 *
 * Mỗi mục có “dấu vết công khai” (public_fingerprint) = băm của đúng các dữ liệu khách thấy
 * (kể cả giá và còn/hết hàng của từng phiên bản). Sau mỗi lần ghi, gọi sync…() trong cùng giao dịch:
 * dấu vết khác trước → cập nhật public_updated_at. Lưu nháp, đổi số tồn khi vẫn còn hàng,
 * hay khởi động lại đều không làm đổi ngày.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type Kind = "products" | "categories" | "news_posts" | "content_pages";
const KEY: Record<Kind, string> = { products: "id", categories: "id", news_posts: "id", content_pages: "slug" };

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

function productFingerprint(db: DatabaseSync, id: string): string | null {
  const p = db
    .prepare(
      `SELECT is_visible, slug, name, brand, category_id, short_description, description, highlights_json, specs_json,
              option_names_json, seo_title, seo_description FROM products WHERE id = ?`,
    )
    .get(id);
  if (!p) return null;
  const variants = db
    .prepare(
      `SELECT sku, options_json, price, compare_at_price, stock > 0 AS in_stock FROM product_variants
       WHERE product_id = ? AND is_active = 1 ORDER BY position, id`,
    )
    .all(id);
  const images = db
    .prepare("SELECT file_name, alt, is_primary FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, position, id")
    .all(id);
  return hash([p, variants, images]);
}

function rowFingerprint(db: DatabaseSync, kind: Exclude<Kind, "products">, key: string | number): string | null {
  const cols =
    kind === "categories"
      ? "is_visible, slug, name, description, body, parent_id, seo_title, seo_description"
      : kind === "news_posts"
        ? "is_public, slug, title, summary, body, cover_file, cover_alt, published_at, seo_title, seo_description"
        : "is_public, title, body, seo_title, seo_description";
  const row = db.prepare(`SELECT ${cols} FROM ${kind} WHERE ${KEY[kind]} = ?`).get(key);
  return row ? hash(row) : null;
}

function sync(db: DatabaseSync, kind: Kind, key: string | number, now: string) {
  const fp = kind === "products" ? productFingerprint(db, String(key)) : rowFingerprint(db, kind, key);
  if (fp === null) return;
  const cur = db.prepare(`SELECT public_fingerprint FROM ${kind} WHERE ${KEY[kind]} = ?`).get(key) as { public_fingerprint: string | null };
  if (cur.public_fingerprint !== fp) {
    db.prepare(`UPDATE ${kind} SET public_fingerprint = ?, public_updated_at = ? WHERE ${KEY[kind]} = ?`).run(fp, now, key);
  }
  // Từng công khai (để khoá slug): một khi đã Hiện thì giữ đánh dấu.
  if (kind === "products" || kind === "categories") {
    db.prepare(`UPDATE ${kind} SET ever_public = 1 WHERE id = ? AND is_visible = 1 AND ever_public = 0`).run(key);
  }
}

const iso = () => new Date().toISOString();

export function syncProductPublic(db: DatabaseSync, ids: Iterable<string>, now = iso()) {
  for (const id of new Set(ids)) sync(db, "products", id, now);
}
export function syncCategoryPublic(db: DatabaseSync, ids: Iterable<number>, now = iso()) {
  for (const id of new Set(ids)) sync(db, "categories", id, now);
}
export function syncNewsPublic(db: DatabaseSync, id: number, now = iso()) {
  sync(db, "news_posts", id, now);
}
export function syncPagePublic(db: DatabaseSync, slug: string, now = iso()) {
  sync(db, "content_pages", slug, now);
}

/**
 * Khởi động: điền dấu vết cho các mục CHƯA có (dữ liệu trước v8 hoặc mục do seed tạo),
 * KHÔNG đặt public_updated_at — không có căn cứ biết lần sửa công khai trước đó.
 */
export function fillMissingFingerprints(db: DatabaseSync) {
  const kinds: Kind[] = ["products", "categories", "news_posts", "content_pages"];
  for (const kind of kinds) {
    const keys = db.prepare(`SELECT ${KEY[kind]} AS k FROM ${kind} WHERE public_fingerprint IS NULL`).all() as { k: string | number }[];
    if (!keys.length) continue;
    const set = db.prepare(`UPDATE ${kind} SET public_fingerprint = ? WHERE ${KEY[kind]} = ?`);
    for (const { k } of keys) {
      const fp = kind === "products" ? productFingerprint(db, String(k)) : rowFingerprint(db, kind, k);
      if (fp) set.run(fp, k);
    }
  }
}
