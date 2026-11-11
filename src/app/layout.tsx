import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { siteConfig } from "@/config/site";
import { DEFAULT_SETTINGS } from "@/lib/content/settings";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Tiêu đề mặc định (trang 404 gốc). Trang cửa hàng và quản trị dùng tên trong Cài đặt website.
export const metadata: Metadata = {
  title: {
    default: `${DEFAULT_SETTINGS.brandName} – Mua sắm đa ngành, miễn phí giao hàng toàn quốc`,
    template: `%s | ${DEFAULT_SETTINGS.brandName}`,
  },
  description: siteConfig.description,
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  // Cho phép đọc env(safe-area-inset-*) trên iPhone (thanh mua hàng cố định tránh thanh Home).
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${beVietnamPro.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
