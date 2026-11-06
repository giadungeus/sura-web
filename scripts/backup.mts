/**
 * Sao lưu đầy đủ CSDL + ảnh tải lên, chạy được cả khi website đang chạy:
 *
 *   npm run backup                      → .data/backups/<thời-gian>/
 *   npm run backup -- --dest D:\SaoLuu  → D:\SaoLuu\<thời-gian>/
 *
 * - CSDL: dùng API backup của SQLite → bản chụp nhất quán (gồm cả dữ liệu còn trong tệp WAL),
 *   rồi chuyển về một tệp duy nhất (không cần kèm -wal/-shm).
 * - Ảnh: sao chép SAU khi chụp CSDL. Ảnh luôn được ghi ra đĩa trước khi CSDL ghi nhận,
 *   và không bao giờ bị ghi đè/xoá, nên mọi ảnh mà bản CSDL nhắc tới đều có trong bản sao.
 * - Kiểm tra integrity_check và đối chiếu: ảnh nào trong CSDL mà thiếu tệp sẽ được báo.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";

const cwd = process.cwd();
const dbPath = process.env.SHOP_DB_PATH || path.join(cwd, ".data", "shop.sqlite");
const uploadDir = process.env.SHOP_UPLOAD_DIR || path.join(cwd, ".data", "uploads", "products");
const destArg = process.argv.indexOf("--dest");
const destRoot = destArg > -1 && process.argv[destArg + 1] ? path.resolve(process.argv[destArg + 1]) : path.join(cwd, ".data", "backups");

if (!existsSync(dbPath)) {
  console.error(`✗ Không thấy CSDL tại ${dbPath}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
const dest = path.join(destRoot, stamp);
mkdirSync(path.join(dest, "uploads", "products"), { recursive: true });
const destDb = path.join(dest, "shop.sqlite");

// 1) Chụp CSDL nhất quán khi đang chạy.
const source = new DatabaseSync(dbPath, { readOnly: true });
await backup(source, destDb);
source.close();

// Gộp về một tệp duy nhất và kiểm tra toàn vẹn.
const copy = new DatabaseSync(destDb);
copy.exec("PRAGMA journal_mode = DELETE");
const integrity = (copy.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check;
const count = (sql: string) => (copy.prepare(sql).get() as { n: number }).n;
const stats = {
  orders: count("SELECT COUNT(*) n FROM orders"),
  products: count("SELECT COUNT(*) n FROM products"),
  categories: count("SELECT COUNT(*) n FROM categories"),
  images: count("SELECT COUNT(*) n FROM product_images"),
  admins: count("SELECT COUNT(*) n FROM admins"),
};
// Ảnh nội dung (trong bài, ảnh bìa — migration v7). CSDL cũ chưa có bảng này thì bỏ qua.
const hasContentImages = !!copy.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'content_images'").get();
const contentImages = hasContentImages ? count("SELECT COUNT(*) n FROM content_images") : 0;
const referenced = [
  ...(copy.prepare("SELECT file_name FROM product_images").all() as { file_name: string }[]),
  ...(hasContentImages ? (copy.prepare("SELECT file_name FROM content_images").all() as { file_name: string }[]) : []),
].map((r) => r.file_name);
copy.close();

// 2) Sao chép ảnh sau khi đã chụp CSDL.
let copied = 0;
if (existsSync(uploadDir)) {
  for (const name of readdirSync(uploadDir)) {
    if (!/^[a-f0-9]{32}\.webp$/.test(name)) continue; // bỏ tệp tạm/lạ
    cpSync(path.join(uploadDir, name), path.join(dest, "uploads", "products", name), { preserveTimestamps: true });
    copied++;
  }
}
const missing = referenced.filter((f) => !existsSync(path.join(dest, "uploads", "products", f)));

const manifest = { createdAt: new Date().toISOString(), source: { dbPath, uploadDir }, integrity, ...stats, contentImages, imageFilesCopied: copied, missingImages: missing };
writeFileSync(path.join(dest, "thong-tin-sao-luu.json"), JSON.stringify(manifest, null, 2));

console.log(`✓ Đã sao lưu vào: ${dest}`);
console.log(`  CSDL: ${integrity === "ok" ? "toàn vẹn (ok)" : `LỖI: ${integrity}`} · ${stats.orders} đơn · ${stats.products} sản phẩm · ${stats.categories} danh mục · ${stats.admins} tài khoản quản trị`);
console.log(`  Ảnh: ${stats.images} ảnh sản phẩm + ${contentImages} ảnh nội dung trong CSDL · đã chép ${copied} tệp${missing.length ? ` · THIẾU ${missing.length} tệp: ${missing.join(", ")}` : " · không thiếu tệp nào"}`);
if (integrity !== "ok" || missing.length) process.exit(2);
