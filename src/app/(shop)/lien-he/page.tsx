import { ContentPage, contentPageMetadata } from "@/components/info/info-page";

// Nội dung sửa trong Quản trị → Trang nội dung.
export function generateMetadata() {
  return contentPageMetadata("lien-he");
}

export default function ContactPage() {
  return <ContentPage slug="lien-he" />;
}
