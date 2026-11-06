import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo-text";

/**
 * Cho phép thu thập toàn bộ (kể cả CSS/JS). Trang không cần lập chỉ mục (quản trị, giỏ hàng,
 * tìm kiếm, thanh toán, đơn hàng, URL lọc/sắp xếp) dùng thẻ noindex — robots.txt không dùng để ẩn trang.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
