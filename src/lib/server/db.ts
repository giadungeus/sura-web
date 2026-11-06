import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seedCatalogIfNeeded } from "@/lib/server/catalog-seed";
import { fillMissingFingerprints } from "@/lib/server/public-state";
import { configure, migrate } from "@/lib/server/schema";
import { seedSiteContent } from "@/lib/server/site-content-seed";

/**
 * Cơ sở dữ liệu SQLite (module `node:sqlite` có sẵn trong Node.js, không cần cài thêm).
 * Mặc định lưu tại `.data/shop.sqlite` trong thư mục dự án; đổi bằng biến môi trường SHOP_DB_PATH.
 */
export function getDbPath(): string {
  return process.env.SHOP_DB_PATH || path.join(process.cwd(), ".data", "shop.sqlite");
}

// Giữ một kết nối duy nhất, kể cả khi dev server nạp lại module.
const globalForDb = globalThis as unknown as { __shopDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!globalForDb.__shopDb) {
    // `next build` không bao giờ được mở CSDL (sẽ chạy migration/ghi vào CSDL thật của máy build).
    // Dữ liệu chỉ đọc lúc có yêu cầu: gọi `await connection()` trước khi đọc CSDL.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      throw new Error("[db] Không được mở CSDL trong lúc build — thiếu `await connection()` trước khi đọc dữ liệu?");
    }
    const dbPath = getDbPath();
    mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new DatabaseSync(dbPath);
    configure(db);
    migrate(db);
    seedCatalogIfNeeded(db);
    seedSiteContent(db);
    db.exec("BEGIN IMMEDIATE");
    try {
      fillMissingFingerprints(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
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
