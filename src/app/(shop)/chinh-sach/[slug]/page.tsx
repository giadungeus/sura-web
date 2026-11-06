import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ContentPage, contentPageMetadata } from "@/components/info/info-page";
import { POLICY_SLUGS } from "@/lib/content/pages";

type Props = PageProps<"/chinh-sach/[slug]">;

// Các trang chính sách; nội dung sửa trong Quản trị → Trang nội dung.
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return contentPageMetadata(POLICY_SLUGS.includes(slug) ? slug : "");
}

export default function PolicyPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-6xl animate-pulse px-4 pt-6" aria-busy="true" />}>
      <Policy params={params} />
    </Suspense>
  );
}

async function Policy({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  if (!POLICY_SLUGS.includes(slug)) notFound();
  return <ContentPage slug={slug} />;
}
