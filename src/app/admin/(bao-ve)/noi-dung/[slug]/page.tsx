import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getPageForAdmin, getPreviewContext } from "@/lib/server/site-content";
import { PageEditor } from "./page-editor";

export const metadata: Metadata = { title: "Sửa trang nội dung" };

type Props = PageProps<"/admin/noi-dung/[slug]">;

export default function EditContentPage({ params }: Props) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/admin/noi-dung" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="size-4" aria-hidden /> Trang nội dung
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: Pick<Props, "params">) {
  const { slug } = await params;
  await requireAdmin(`/admin/noi-dung/${encodeURIComponent(slug)}`);
  const page = getPageForAdmin(slug);
  if (!page) {
    return <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm">Không tìm thấy trang.</p>;
  }
  const { vars, hiddenPaths } = getPreviewContext();
  return <PageEditor page={page} vars={vars} hiddenPaths={hiddenPaths} />;
}
