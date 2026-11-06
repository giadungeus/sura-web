import type { Metadata } from "next";
import { ShopChrome } from "@/components/layout/shop-chrome";
import { siteConfig } from "@/config/site";
import { getSiteSettings } from "@/lib/server/site-content";

// Tên thương hiệu lấy từ Cài đặt website (đọc lúc có yêu cầu; các trang cửa hàng vốn đã có phần động).
// Không đặt mô tả chung: mỗi trang tự có mô tả riêng (hoặc không có), tránh mọi trang trùng một mô tả.
export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getSiteSettings();
  return {
    title: { default: `${brandName} – Mua sắm đa ngành, ${siteConfig.shipping.label.toLowerCase()}`, template: `%s | ${brandName}` },
  };
}

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return <ShopChrome>{children}</ShopChrome>;
}
