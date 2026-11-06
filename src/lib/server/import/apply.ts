import "server-only";
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { productSearchText } from "@/lib/server/catalog-seed";
import type { CategoryRef, ImportPlan } from "@/lib/server/import/plan";
import { syncCategoryPublic, syncProductPublic } from "@/lib/server/public-state";

export type ImageJob = { productId: string; productLabel: string; url: string };
export type ApplyResult = { createdProductIds: string[]; updatedProductIds: string[]; imageJobs: ImageJob[] };

/**
 * Ghi kế hoạch nhập vào CSDL. Phải gọi BÊN TRONG giao dịch, ngay sau khi lập lại kế hoạch
 * trên dữ liệu mới nhất và không còn lỗi.
 * - Sản phẩm và danh mục MỚI mặc định HIỆN; quản trị có thể chọn tạo ở trạng thái Ẩn (newVisible = false).
 * - Sản phẩm/danh mục đã có: KHÔNG đổi trạng thái Hiện/Ẩn; chỉ cập nhật trường có giá trị trong file.
 * - Giá nhập lưu vào cost_price (chỉ quản trị đọc), không bao giờ ghi vào giá bán.
 */
export function applyImportPlan(db: DatabaseSync, plan: ImportPlan, opts: { newVisible?: boolean } = {}): ApplyResult {
  const now = new Date().toISOString();
  const visible = opts.newVisible === false ? 0 : 1;
  const categoryIds = new Map<string, number>();
  const resolve = (ref: CategoryRef): number => ("id" in ref ? ref.id : categoryIds.get(ref.newKey)!);

  const insertCategory = db.prepare(
    `INSERT INTO categories (slug, name, description, icon, parent_id, sort_order, is_visible, created_at, updated_at)
     VALUES (?, ?, '', 'shopping-bag', ?, 1000, ?, ?, ?)`,
  );
  for (const c of plan.categories) {
    const r = insertCategory.run(c.slug, c.name, c.parent ? resolve(c.parent) : null, visible, now, now);
    categoryIds.set(c.key, Number(r.lastInsertRowid));
  }

  const result: ApplyResult = { createdProductIds: [], updatedProductIds: [], imageJobs: [] };
  const insertVariant = db.prepare(
    `INSERT INTO product_variants (product_id, sku, options_json, options_key, price, compare_at_price, stock, cost_price, position, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  );

  for (const p of plan.products) {
    if (p.action === "unchanged") continue;
    let productId = p.existingId;

    if (productId === null) {
      productId = `sp-${randomBytes(4).toString("hex")}`;
      db.prepare(
        `INSERT INTO products (id, slug, name, brand, category_id, short_description, description, highlights_json,
                               option_names_json, placeholder_tone, placeholder_icon, is_visible, search_text,
                               source, source_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'slate', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        productId,
        p.slug!,
        p.name!,
        p.brand ?? "",
        resolve(p.category!),
        p.shortDescription ?? "",
        p.description ?? "",
        JSON.stringify(p.highlights ?? []),
        JSON.stringify(p.optionNames),
        p.placeholderIcon,
        visible,
        productSearchText(p.name!, p.brand ?? "", p.slug!),
        p.source,
        p.code,
        now,
        now,
      );
      p.variants.forEach((v, position) => {
        insertVariant.run(productId!, v.sku, JSON.stringify(v.options), v.key, v.price!, v.compareAtPrice ?? null, v.stock!, v.cost ?? null, position);
      });
      result.createdProductIds.push(productId);
    } else {
      // Chỉ cập nhật trường có trong kế hoạch (đã lọc: có giá trị và khác hiện tại).
      const sets: string[] = [];
      const values: (string | number)[] = [];
      const set = (column: string, value: string | number | undefined) => {
        if (value === undefined) return;
        sets.push(`${column} = ?`);
        values.push(value);
      };
      set("name", p.name);
      set("brand", p.brand);
      set("short_description", p.shortDescription);
      set("description", p.description);
      if (p.highlights) set("highlights_json", JSON.stringify(p.highlights));
      if (p.category) set("category_id", resolve(p.category));
      sets.push("updated_at = ?");
      values.push(now);
      db.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`).run(...values, productId);
      if (p.name || p.brand) {
        const cur = db.prepare("SELECT name, brand, slug FROM products WHERE id = ?").get(productId) as {
          name: string;
          brand: string;
          slug: string;
        };
        db.prepare("UPDATE products SET search_text = ? WHERE id = ?").run(productSearchText(cur.name, cur.brand, cur.slug), productId);
      }

      let position = (
        db.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM product_variants WHERE product_id = ?").get(productId) as { m: number }
      ).m;
      for (const v of p.variants) {
        if (v.action === "new") {
          insertVariant.run(productId, v.sku, JSON.stringify(v.options), v.key, v.price!, v.compareAtPrice ?? null, v.stock!, v.cost ?? null, ++position);
        } else if (v.action === "update") {
          const vs: string[] = [];
          const vv: number[] = [];
          const add = (column: string, value: number | undefined) => {
            if (value === undefined) return;
            vs.push(`${column} = ?`);
            vv.push(value);
          };
          add("price", v.price);
          add("compare_at_price", v.compareAtPrice);
          add("stock", v.stock);
          add("cost_price", v.cost); // giá nhập: chỉ lưu nội bộ
          if (vs.length) db.prepare(`UPDATE product_variants SET ${vs.join(", ")} WHERE id = ? AND product_id = ?`).run(...vv, v.existingId!, productId);
        }
      }
      result.updatedProductIds.push(productId);
    }

    for (const url of p.imageUrls) {
      result.imageJobs.push({ productId, productLabel: `${p.source}/${p.code}`, url });
    }
  }
  // Ghi nhận thay đổi bản công khai (giá, còn/hết hàng, nội dung) để cập nhật lastmod.
  syncCategoryPublic(db, categoryIds.values(), now);
  syncProductPublic(db, [...result.createdProductIds, ...result.updatedProductIds], now);
  return result;
}
