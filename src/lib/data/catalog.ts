/**
 * Lớp truy cập dữ liệu. Hiện đọc từ dữ liệu mẫu trong `src/data`.
 * Khi kết nối cơ sở dữ liệu, chỉ cần thay phần thân các hàm này;
 * các trang và component gọi chúng giữ nguyên.
 */
import { categories } from "@/data/categories";
import { products } from "@/data/products";
import { matchesAllTokens, normalizeVietnamese, tokenize } from "@/lib/search";
import type { Category, Product } from "@/types";

// ───────────── Danh mục ─────────────

export async function getCategories(): Promise<Category[]> {
  return categories;
}

/** Các ngành hàng cấp 1. */
export async function getRootCategories(): Promise<Category[]> {
  return categories.filter((c) => !c.parent);
}

export async function getCategoryBySlug(slug: string): Promise<Category | undefined> {
  return categories.find((c) => c.slug === slug);
}

export async function getChildCategories(slug: string): Promise<Category[]> {
  return categories.filter((c) => c.parent === slug);
}

/** Đường dẫn từ ngành cấp 1 đến danh mục hiện tại (dùng cho breadcrumb). */
export async function getCategoryTrail(slug: string): Promise<Category[]> {
  const trail: Category[] = [];
  let current = categories.find((c) => c.slug === slug);
  while (current) {
    trail.unshift(current);
    const parentSlug: string | undefined = current.parent;
    current = parentSlug ? categories.find((c) => c.slug === parentSlug) : undefined;
  }
  return trail;
}

/** slug của danh mục và toàn bộ danh mục con cháu. */
function collectDescendantSlugs(slug: string): Set<string> {
  const result = new Set<string>([slug]);
  let added = true;
  while (added) {
    added = false;
    for (const c of categories) {
      if (c.parent && result.has(c.parent) && !result.has(c.slug)) {
        result.add(c.slug);
        added = true;
      }
    }
  }
  return result;
}

// ───────────── Sản phẩm ─────────────

export async function getProducts(): Promise<Product[]> {
  return products;
}

export async function getProductById(id: string): Promise<Product | undefined> {
  return products.find((p) => p.id === id);
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  return products.find((p) => p.slug === slug);
}

/** Sản phẩm thuộc danh mục, gồm cả các danh mục con. */
export async function getProductsByCategory(slug: string): Promise<Product[]> {
  const slugs = collectDescendantSlugs(slug);
  return products.filter((p) => slugs.has(p.category));
}

export async function getFeaturedProducts(limit = 8): Promise<Product[]> {
  return products.filter((p) => p.tags?.includes("noi-bat")).slice(0, limit);
}

export async function getNewestProducts(limit = 8): Promise<Product[]> {
  return [...products]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Sản phẩm giảm giá sâu nhất. */
export async function getTopDiscountProducts(limit = 8): Promise<Product[]> {
  const ratio = (p: Product) =>
    p.originalPrice ? (p.originalPrice - p.price) / p.originalPrice : 0;
  return products
    .filter((p) => ratio(p) > 0)
    .sort((a, b) => ratio(b) - ratio(a))
    .slice(0, limit);
}

/** Sản phẩm cùng danh mục, ưu tiên cùng danh mục con rồi đến cùng ngành. */
export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const sameCategory = products.filter(
    (p) => p.category === product.category && p.id !== product.id,
  );
  const parent = categories.find((c) => c.slug === product.category)?.parent;
  const sameRoot = parent
    ? products.filter((p) => {
        if (p.id === product.id || p.category === product.category) return false;
        return categories.find((c) => c.slug === p.category)?.parent === parent;
      })
    : [];
  return [...sameCategory, ...sameRoot].slice(0, limit);
}

/** Tìm kiếm không dấu theo tên, thương hiệu, danh mục và mô tả ngắn. */
export async function searchProducts(query: string): Promise<Product[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  return products.filter((p) => {
    const categoryNames = categories
      .filter((c) => c.slug === p.category || collectDescendantSlugs(c.slug).has(p.category))
      .map((c) => c.name)
      .join(" ");
    const haystack = normalizeVietnamese(
      [p.name, p.brand, categoryNames, p.shortDescription].join(" "),
    );
    return matchesAllTokens(haystack, tokens);
  });
}
