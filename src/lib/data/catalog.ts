/**
 * Lớp truy cập dữ liệu cửa hàng: đọc danh mục và sản phẩm từ CSDL SQLite.
 *
 * `connection()` báo cho Next.js rằng dữ liệu phải đọc lúc có yêu cầu (không đóng băng
 * lúc build), nên sửa trong trang quản trị là cửa hàng cập nhật ngay.
 * Chỉ trả về danh mục/sản phẩm đang hiển thị.
 */
import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { matchesAllTokens, normalizeVietnamese, tokenize } from "@/lib/search";
import type {
  AttributeDef,
  Category,
  IconKey,
  Product,
  ProductPhoto,
  ProductTag,
  ProductVariant,
  SelectedOptions,
  Tone,
} from "@/types";

export const imageUrl = (fileName: string) => `/anh/${fileName}`;

type CategoryRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  parent_id: number | null;
  attributes_json: string;
  sort_order: number;
  is_visible: number;
  seo_title: string | null;
  seo_description: string | null;
  public_updated_at: string | null;
  body: string;
};

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category_id: number;
  short_description: string;
  description: string;
  highlights_json: string;
  specs_json: string;
  tags_json: string;
  option_names_json: string;
  rating: number;
  review_count: number;
  sold: number;
  placeholder_tone: string;
  placeholder_icon: string;
  is_visible: number;
  source: string | null;
  created_at: string;
  seo_title: string | null;
  seo_description: string | null;
  public_updated_at: string | null;
};

type VariantRow = {
  id: number;
  product_id: string;
  sku: string;
  options_json: string;
  price: number;
  compare_at_price: number | null;
  stock: number;
};

type ImageRow = { product_id: string; file_name: string; width: number; height: number; alt: string | null };

const parse = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

type Catalog = {
  categories: Category[];
  products: Product[];
  /** slug danh mục -> tập slug của chính nó và mọi danh mục con cháu (đang hiển thị). */
  descendants: Map<string, Set<string>>;
};

/** Đọc toàn bộ danh mục + sản phẩm đang hiển thị (một lần mỗi request). */
const loadCatalog = cache(async (): Promise<Catalog> => {
  await connection();
  const db = getDb();

  const categoryRows = db
    .prepare("SELECT * FROM categories ORDER BY sort_order, id")
    .all() as CategoryRow[];
  const byId = new Map(categoryRows.map((c) => [c.id, c]));
  // Danh mục hiển thị khi chính nó và mọi danh mục cha đều đang bật.
  const isVisible = (row: CategoryRow): boolean => {
    let current: CategoryRow | undefined = row;
    const seen = new Set<number>();
    while (current) {
      if (!current.is_visible || seen.has(current.id)) return false;
      seen.add(current.id);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return true;
  };
  const visibleRows = categoryRows.filter(isVisible);
  const visibleIds = new Set(visibleRows.map((c) => c.id));

  const categories: Category[] = visibleRows.map((c) => ({
    slug: c.slug,
    name: c.name,
    description: c.description,
    icon: c.icon as IconKey,
    parent: c.parent_id ? byId.get(c.parent_id)?.slug : undefined,
    attributes: parse<AttributeDef[]>(c.attributes_json, []),
    body: c.body ?? "",
    seoTitle: c.seo_title ?? "",
    seoDescription: c.seo_description ?? "",
    publicUpdatedAt: c.public_updated_at,
  }));

  const descendants = new Map<string, Set<string>>();
  for (const c of categories) {
    const set = new Set<string>([c.slug]);
    let added = true;
    while (added) {
      added = false;
      for (const child of categories) {
        if (child.parent && set.has(child.parent) && !set.has(child.slug)) {
          set.add(child.slug);
          added = true;
        }
      }
    }
    descendants.set(c.slug, set);
  }

  const productRows = (db.prepare("SELECT * FROM products WHERE is_visible = 1").all() as ProductRow[]).filter((p) =>
    visibleIds.has(p.category_id),
  );
  const variantRows = db
    .prepare(
      `SELECT id, product_id, sku, options_json, price, compare_at_price, stock
       FROM product_variants WHERE is_active = 1 ORDER BY position, id`,
    )
    .all() as VariantRow[];
  const imageRows = db
    .prepare(
      `SELECT product_id, file_name, width, height, alt FROM product_images
       WHERE product_id IS NOT NULL ORDER BY is_primary DESC, position, id`,
    )
    .all() as ImageRow[];

  const variantsByProduct = new Map<string, ProductVariant[]>();
  for (const v of variantRows) {
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push({
      id: v.id,
      sku: v.sku,
      options: parse<SelectedOptions>(v.options_json, {}),
      price: v.price,
      compareAtPrice: v.compare_at_price ?? undefined,
      stock: v.stock,
    });
    variantsByProduct.set(v.product_id, list);
  }
  const photosByProduct = new Map<string, ProductPhoto[]>();
  for (const img of imageRows) {
    const list = photosByProduct.get(img.product_id) ?? [];
    list.push({ url: imageUrl(img.file_name), width: img.width, height: img.height, alt: img.alt ?? undefined });
    photosByProduct.set(img.product_id, list);
  }

  const products: Product[] = [];
  for (const p of productRows) {
    const variants = variantsByProduct.get(p.id) ?? [];
    if (variants.length === 0) continue; // Không có phiên bản đang bán thì không hiển thị.
    const cheapest = variants.reduce((min, v) => (v.price < min.price ? v : min), variants[0]);
    const photos = photosByProduct.get(p.id) ?? [];
    products.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      category: byId.get(p.category_id)!.slug,
      price: cheapest.price,
      originalPrice:
        cheapest.compareAtPrice && cheapest.compareAtPrice > cheapest.price ? cheapest.compareAtPrice : undefined,
      rating: p.rating,
      reviewCount: p.review_count,
      sold: p.sold,
      stock: variants.reduce((sum, v) => sum + v.stock, 0),
      shortDescription: p.short_description,
      description: p.description,
      highlights: parse<string[]>(p.highlights_json, []),
      specs: parse<Record<string, string>>(p.specs_json, {}),
      optionNames: parse<string[]>(p.option_names_json, []),
      variants,
      tags: parse<ProductTag[]>(p.tags_json, []),
      image: { tone: p.placeholder_tone as Tone, icon: p.placeholder_icon as IconKey, url: photos[0]?.url },
      photos,
      createdAt: p.created_at,
      seoTitle: p.seo_title ?? "",
      seoDescription: p.seo_description ?? "",
      publicUpdatedAt: p.public_updated_at,
    });
  }

  return { categories, products, descendants };
});

// ───────────── Danh mục ─────────────

export async function getCategories(): Promise<Category[]> {
  return (await loadCatalog()).categories;
}

/** Các ngành hàng cấp 1. */
export async function getRootCategories(): Promise<Category[]> {
  return (await loadCatalog()).categories.filter((c) => !c.parent);
}

export async function getCategoryBySlug(slug: string): Promise<Category | undefined> {
  return (await loadCatalog()).categories.find((c) => c.slug === slug);
}

export async function getChildCategories(slug: string): Promise<Category[]> {
  return (await loadCatalog()).categories.filter((c) => c.parent === slug);
}

/** Đường dẫn từ ngành cấp 1 đến danh mục hiện tại (dùng cho breadcrumb). */
export async function getCategoryTrail(slug: string): Promise<Category[]> {
  const { categories } = await loadCatalog();
  const trail: Category[] = [];
  let current = categories.find((c) => c.slug === slug);
  while (current && trail.length < 10) {
    trail.unshift(current);
    const parentSlug: string | undefined = current.parent;
    current = parentSlug ? categories.find((c) => c.slug === parentSlug) : undefined;
  }
  return trail;
}

// ───────────── Sản phẩm ─────────────

const byNewest = (a: Product, b: Product) => b.createdAt.localeCompare(a.createdAt);

export async function getProducts(): Promise<Product[]> {
  return (await loadCatalog()).products;
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  return (await loadCatalog()).products.find((p) => p.slug === slug);
}

/** Sản phẩm thuộc danh mục, gồm cả các danh mục con. */
export async function getProductsByCategory(slug: string): Promise<Product[]> {
  const { products, descendants } = await loadCatalog();
  const slugs = descendants.get(slug) ?? new Set([slug]);
  return products.filter((p) => slugs.has(p.category));
}


export async function getNewestProducts(limit = 8): Promise<Product[]> {
  return [...(await loadCatalog()).products].sort(byNewest).slice(0, limit);
}

/** Sản phẩm giảm giá sâu nhất. */

/** Sản phẩm cùng danh mục, ưu tiên cùng danh mục con rồi đến cùng ngành. */
export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const { products, categories } = await loadCatalog();
  const sameCategory = products.filter((p) => p.category === product.category && p.id !== product.id);
  const parent = categories.find((c) => c.slug === product.category)?.parent;
  const sameRoot = parent
    ? products.filter(
        (p) =>
          p.id !== product.id &&
          p.category !== product.category &&
          categories.find((c) => c.slug === p.category)?.parent === parent,
      )
    : [];
  return [...sameCategory, ...sameRoot].slice(0, limit);
}

/** Tìm kiếm không dấu theo tên, thương hiệu, danh mục, mô tả ngắn và SKU. */
export async function searchProducts(query: string): Promise<Product[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const { products, categories, descendants } = await loadCatalog();
  return products.filter((p) => {
    const categoryNames = categories
      .filter((c) => descendants.get(c.slug)?.has(p.category))
      .map((c) => c.name)
      .join(" ");
    const haystack = normalizeVietnamese(
      [p.name, p.brand, categoryNames, p.shortDescription, ...p.variants.map((v) => v.sku)].join(" "),
    );
    return matchesAllTokens(haystack, tokens);
  });
}
