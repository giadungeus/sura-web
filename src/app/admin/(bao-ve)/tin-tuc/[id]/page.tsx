import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getNewsForAdmin, getPreviewContext } from "@/lib/server/site-content";
import { NewsForm } from "../news-form";

export const metadata: Metadata = { title: "Sửa bài viết" };

type Props = PageProps<"/admin/tin-tuc/[id]">;

export default function EditNewsPage({ params }: Props) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/admin/tin-tuc" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="size-4" aria-hidden /> Tin tức
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: Pick<Props, "params">) {
  const { id: raw } = await params;
  const id = /^\d{1,9}$/.test(raw) ? Number(raw) : null;
  await requireAdmin(id ? `/admin/tin-tuc/${id}` : "/admin/tin-tuc");
  const post = id ? getNewsForAdmin(id) : undefined;
  if (!post) {
    return <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm">Không tìm thấy bài viết.</p>;
  }
  const { vars, hiddenPaths } = getPreviewContext();
  return <NewsForm post={post} vars={vars} hiddenPaths={hiddenPaths} />;
}
