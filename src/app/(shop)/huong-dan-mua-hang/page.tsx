import { ContentPage, contentPageMetadata } from "@/components/info/info-page";

// Nội dung sửa trong Quản trị → Trang nội dung.
export function generateMetadata() {
  return contentPageMetadata("huong-dan-mua-hang");
}

export default function BuyingGuidePage() {
  return <ContentPage slug="huong-dan-mua-hang" />;
}
