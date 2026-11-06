import { ContentPage, contentPageMetadata } from "@/components/info/info-page";

// Nội dung sửa trong Quản trị → Trang nội dung.
export function generateMetadata() {
  return contentPageMetadata("gioi-thieu");
}

export default function AboutPage() {
  return <ContentPage slug="gioi-thieu" />;
}
