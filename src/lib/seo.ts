/**
 * Metadata và dữ liệu có cấu trúc (JSON-LD) cho trang công khai.
 * Chỉ dùng dữ liệu thật đang hiển thị; không tự thêm đánh giá, GTIN, tác giả, thời gian giao, đổi trả.
 */
import type { Metadata } from "next";
import type { PublicSettings } from "@/lib/content/settings";
import { SITE_URL, absoluteUrl } from "@/lib/seo-text";
import type { Product } from "@/types";

export { SITE_URL, absoluteUrl };

type PageMetaInput = {
  /** Đường dẫn chuẩn (canonical), vd. /san-pham/abc hoặc /danh-muc/x?trang=2. */
  path: string | null;
  title: string;
  description: string;
  brand: string;
  image?: { url: string; width?: number; height?: number; alt?: string } | null;
  type?: "website" | "article";
  /** Trang không lập chỉ mục (tìm kiếm, giỏ hàng, URL lọc/sắp xếp…). Vẫn cho đi theo liên kết. */
  noindex?: boolean;
};

export function pageMetadata(m: PageMetaInput): Metadata {
  const url = m.path ? absoluteUrl(m.path) : undefined;
  return {
    title: { absolute: m.title },
    description: m.description || undefined,
    alternates: url ? { canonical: url } : undefined,
    robots: m.noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: m.title,
      description: m.description || undefined,
      url,
      siteName: m.brand,
      locale: "vi_VN",
      type: m.type ?? "website",
      images: m.image ? [{ url: absoluteUrl(m.image.url), width: m.image.width, height: m.image.height, alt: m.image.alt }] : undefined,
    },
  };
}

/** Trang không lập chỉ mục, không có canonical (giỏ hàng, tìm kiếm…). */
export function noindexMetadata(title: string): Metadata {
  return { title, robots: { index: false, follow: true } };
}

// ───────────── JSON-LD ─────────────

export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** Thông tin cửa hàng thật trong Cài đặt website. Chưa có logo nên không khai logo. */
export function organizationLd(s: PublicSettings) {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${SITE_URL}/#to-chuc`,
    name: s.brandName,
    ...(s.companyName ? { legalName: s.companyName } : {}),
    url: `${SITE_URL}/`,
    ...(s.email ? { email: s.email } : {}),
    ...(s.hotline ? { telephone: s.hotline } : {}),
    ...(s.address ? { address: { "@type": "PostalAddress", streetAddress: s.address, addressCountry: "VN" } } : {}),
  };
}

/** Nhà xuất bản (bài tin tức): chính cửa hàng. */
const publisherLd = (s: PublicSettings) => ({ "@type": "Organization", "@id": `${SITE_URL}/#to-chuc`, name: s.brandName, url: `${SITE_URL}/` });

/** Breadcrumb theo đúng đường dẫn hiển thị (có “Trang chủ” ở đầu). Mục cuối là trang hiện tại. */
export function breadcrumbLd(items: { name: string; path: string }[]) {
  const all = [{ name: "Trang chủ", path: "/" }, ...items];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: all.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absoluteUrl(c.path) })),
  };
}

/**
 * Product/Offer chỉ cho sản phẩm KHÔNG có biến thể (một phiên bản, không thuộc tính).
 * Sản phẩm có biến thể: Google yêu cầu mỗi biến thể có URL chọn sẵn riêng để dùng ProductGroup;
 * website chưa có URL như vậy nên chưa khai Product cho các sản phẩm này.
 */
export function productLd(p: Product, description: string) {
  if (p.variants.length !== 1 || Object.keys(p.variants[0].options).length > 0) return null;
  const v = p.variants[0];
  if (!(v.price > 0)) return null;
  const url = absoluteUrl(`/san-pham/${p.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    ...(p.photos.length ? { image: p.photos.map((ph) => absoluteUrl(ph.url)) } : {}),
    ...(description ? { description } : {}),
    sku: v.sku,
    ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
    offers: {
      "@type": "Offer",
      url,
      price: v.price,
      priceCurrency: "VND",
      availability: v.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}

/** Article cho tin tức. Không khai tác giả (chưa có người/tổ chức được cấu hình làm tác giả). */
export function articleLd(
  post: { title: string; slug: string; coverUrl: string | null; publishedAt: string; publicUpdatedAt: string | null },
  s: PublicSettings,
) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    mainEntityOfPage: absoluteUrl(`/tin-tuc/${post.slug}`),
    ...(post.coverUrl ? { image: [absoluteUrl(post.coverUrl)] } : {}),
    datePublished: post.publishedAt,
    ...(post.publicUpdatedAt ? { dateModified: post.publicUpdatedAt } : {}),
    publisher: publisherLd(s),
  };
}
