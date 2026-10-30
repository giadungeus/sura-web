/**
 * Nhập danh mục và sản phẩm mẫu (src/data) vào CSDL. Module thuần (import tương đối)
 * để dùng chung cho ứng dụng và lệnh `npm run catalog:import`.
 *
 * Chạy lại an toàn: danh mục/sản phẩm đã có (theo slug/ID) được bỏ qua, không ghi đè
 * chỉnh sửa trong trang quản trị và không tạo bản trùng.
 */
import type { DatabaseSync } from "node:sqlite";
import { categories as seedCategories } from "../../data/categories.ts";
import { products as seedProducts } from "../../data/products.ts";
import { optionsKey } from "../cart-key.ts";
import { normalizeVietnamese } from "../search.ts";
import { skuFromText } from "../slug.ts";
import type { SeedProduct, SelectedOptions } from "../../types/index.ts";

export type SeedResult = {
  categoriesAdded: number;
  categoriesSkipped: number;
  productsAdded: number;
  productsSkipped: number;
  variantsAdded: number;
};

type SeedVariant = { options: SelectedOptions; price: number; compareAt: number | null };

/** Tổ hợp mọi lựa chọn của các nhóm biến thể kiểu cũ (giá gốc + chênh lệch). */
function expandVariants(product: SeedProduct): SeedVariant[] {
  let combos: SeedVariant[] = [{ options: {}, price: product.price, compareAt: product.originalPrice ?? null }];
  for (const group of product.variants ?? []) {
    combos = combos.flatMap((combo) =>
      group.options.map((option) => ({
        options: { ...combo.options, [group.name]: option.label },
        price: combo.price + (option.priceDelta ?? 0),
        compareAt: combo.compareAt === null ? null : combo.compareAt + (option.priceDelta ?? 0),
      })),
    );
  }
  return combos;
}

export function productSearchText(name: string, brand: string, slug: string): string {
  return normalizeVietnamese(`${name} ${brand} ${slug.replace(/-/g, " ")}`);
}

export function seedCatalog(db: DatabaseSync): SeedResult {
  const now = new Date().toISOString();
  const result: SeedResult = {
    categoriesAdded: 0,
    categoriesSkipped: 0,
    productsAdded: 0,
    productsSkipped: 0,
    variantsAdded: 0,
  };

  db.exec("BEGIN IMMEDIATE");
  try {
    const insertCategory = db.prepare(`
      INSERT INTO categories (slug, name, description, icon, parent_id, attributes_json, sort_order, is_visible, created_at, updated_at)
      VALUES (?, ?, ?, ?, (SELECT id FROM categories WHERE slug = ?), ?, ?, 1, ?, ?)
      ON CONFLICT DO NOTHING
    `);
    // Cha trước, con sau để tìm được parent_id.
    const ordered = [...seedCategories].sort((a, b) => Number(Boolean(a.parent)) - Number(Boolean(b.parent)));
    ordered.forEach((c) => {
      const sortOrder = seedCategories.indexOf(c) * 10;
      const r = insertCategory.run(
        c.slug,
        c.name,
        c.description,
        c.icon,
        c.parent ?? null,
        JSON.stringify(c.attributes ?? []),
        sortOrder,
        now,
        now,
      );
      if (r.changes) result.categoriesAdded++;
      else result.categoriesSkipped++;
    });

    const insertProduct = db.prepare(`
      INSERT INTO products (id, slug, name, brand, category_id, short_description, description, highlights_json,
                            specs_json, tags_json, option_names_json, rating, review_count, sold,
                            placeholder_tone, placeholder_icon, is_visible, search_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, (SELECT id FROM categories WHERE slug = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `);
    const insertVariant = db.prepare(`
      INSERT INTO product_variants (product_id, sku, options_json, options_key, price, compare_at_price, stock, position, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT DO NOTHING
    `);

    for (const p of seedProducts) {
      const r = insertProduct.run(
        p.id,
        p.slug,
        p.name,
        p.brand,
        p.category,
        p.shortDescription,
        p.description,
        JSON.stringify(p.highlights),
        JSON.stringify(p.specs),
        JSON.stringify(p.tags ?? []),
        JSON.stringify((p.variants ?? []).map((g) => g.name)),
        p.rating,
        p.reviewCount,
        p.sold,
        p.image.tone,
        p.image.icon,
        productSearchText(p.name, p.brand, p.slug),
        `${p.createdAt}T00:00:00.000Z`,
        now,
      );
      if (!r.changes) {
        result.productsSkipped++;
        continue; // Sản phẩm đã có: không đụng tới biến thể (có thể đã sửa trong quản trị).
      }
      result.productsAdded++;

      const variants = expandVariants(p);
      // Dữ liệu mẫu chỉ có tồn kho cho cả sản phẩm: chia đều cho các biến thể.
      const stockEach = Math.max(1, Math.floor(p.stock / variants.length));
      variants.forEach((v, index) => {
        const suffix = Object.values(v.options).map(skuFromText).join("-");
        const sku = suffix ? `${p.id.toUpperCase()}-${suffix}` : p.id.toUpperCase();
        const vr = insertVariant.run(
          p.id,
          sku.slice(0, 40),
          JSON.stringify(v.options),
          optionsKey(v.options),
          v.price,
          v.compareAt,
          variants.length === 1 ? p.stock : stockEach,
          index,
        );
        if (vr.changes) result.variantsAdded++;
      });
    }

    db.prepare(
      "INSERT INTO app_settings (key, value) VALUES ('catalog_seeded_at', ?) ON CONFLICT(key) DO NOTHING",
    ).run(now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return result;
}

/** Chỉ nhập tự động một lần cho CSDL mới; sau đó dùng lệnh `npm run catalog:import` nếu cần. */
export function seedCatalogIfNeeded(db: DatabaseSync): void {
  const done = db.prepare("SELECT 1 FROM app_settings WHERE key = 'catalog_seeded_at'").get();
  if (!done) seedCatalog(db);
}
