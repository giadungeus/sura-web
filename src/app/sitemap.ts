import type { MetadataRoute } from "next";
import { getCategories, getProducts } from "@/lib/data/catalog";
import { getPublicNews, listPublicContentPages } from "@/lib/server/site-content";
import { absoluteUrl } from "@/lib/seo-text";

/**
 * Sitemap: chỉ URL chuẩn, đang công khai và được phép lập chỉ mục.
 * - Danh mục đang hiện (kể cả danh mục cha) và có sản phẩm; KHÔNG gồm trang phân trang hay URL lọc/sắp xếp.
 * - Sản phẩm đang hiện thuộc danh mục đang hiện (kể cả hết hàng).
 * - Tin tức và trang nội dung đang công khai.
 * - lastmod = lần cuối bản công khai thay đổi; dữ liệu cũ chưa rõ ngày thì bỏ trống (không đoán).
 * Đọc CSDL lúc có yêu cầu nên tự cập nhật khi công khai, ẩn hoặc xoá.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products, news, pages] = await Promise.all([getCategories(), getProducts(), getPublicNews(), listPublicContentPages()]);
  const entry = (path: string, lastmod?: string | null): MetadataRoute.Sitemap[number] => ({
    url: absoluteUrl(path),
    ...(lastmod ? { lastModified: lastmod } : {}),
  });

  // Danh mục có ít nhất một sản phẩm đang hiện (tính cả danh mục con cháu).
  const withProducts = new Set<string>();
  const parentOf = new Map(categories.map((c) => [c.slug, c.parent]));
  for (const p of products) {
    let slug: string | undefined = p.category;
    for (let i = 0; slug && i < 10; i++) {
      withProducts.add(slug);
      slug = parentOf.get(slug);
    }
  }

  return [
    entry("/"),
    ...categories.filter((c) => withProducts.has(c.slug)).map((c) => entry(`/danh-muc/${c.slug}`, c.publicUpdatedAt)),
    ...products.map((p) => entry(`/san-pham/${p.slug}`, p.publicUpdatedAt)),
    ...(news.length ? [entry("/tin-tuc")] : []),
    ...news.map((n) => entry(`/tin-tuc/${n.slug}`, n.publicUpdatedAt)),
    ...pages.map((pg) => entry(pg.path, pg.publicUpdatedAt)),
  ];
}
