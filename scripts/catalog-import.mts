/**
 * Nhập danh mục và sản phẩm mẫu (src/data) vào CSDL:
 *
 *   npm run catalog:import
 *
 * Chạy lại bao nhiêu lần cũng được: bản ghi đã có (theo slug/ID) được bỏ qua,
 * không tạo trùng và không ghi đè chỉnh sửa trong trang quản trị.
 * Lưu ý: website cũng tự nhập một lần khi CSDL chưa có dữ liệu danh mục.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seedCatalog } from "../src/lib/server/catalog-seed.ts";
import { configure, migrate } from "../src/lib/server/schema.ts";

const dbPath = process.env.SHOP_DB_PATH || path.join(process.cwd(), ".data", "shop.sqlite");
mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
configure(db);
migrate(db);

const r = seedCatalog(db);
const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
console.log(`CSDL: ${dbPath}`);
console.log(`Danh mục: thêm ${r.categoriesAdded}, bỏ qua (đã có) ${r.categoriesSkipped}`);
console.log(`Sản phẩm: thêm ${r.productsAdded}, bỏ qua (đã có) ${r.productsSkipped}; biến thể thêm ${r.variantsAdded}`);
console.log(
  `Tổng hiện có: ${count("SELECT COUNT(*) n FROM categories")} danh mục, ${count("SELECT COUNT(*) n FROM products")} sản phẩm, ${count("SELECT COUNT(*) n FROM product_variants")} biến thể.`,
);
