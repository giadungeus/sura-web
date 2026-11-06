import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getPreviewContext } from "@/lib/server/site-content";
import { NewsForm } from "../news-form";

export const metadata: Metadata = { title: "Viết bài mới" };

export default function NewNewsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/admin/tin-tuc" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="size-4" aria-hidden /> Tin tức
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireAdmin("/admin/tin-tuc/moi");
  const { vars, hiddenPaths } = getPreviewContext();
  return <NewsForm post={null} vars={vars} hiddenPaths={hiddenPaths} />;
}
