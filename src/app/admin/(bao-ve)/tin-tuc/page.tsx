import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { PublishBadge, UpdatedLine } from "@/components/admin/publish-status";
import { requireAdmin } from "@/lib/server/admin-auth";
import { listNewsForAdmin } from "@/lib/server/site-content";

export const metadata: Metadata = { title: "Tin tức" };

export default function NewsAdminPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Tin tức</h1>
          <p className="mt-1 text-sm text-neutral-500">Chỉ bài Công khai hiện ở trang Tin tức; bài Nháp và Đã ẩn không truy cập được.</p>
        </div>
        <Link
          href="/admin/tin-tuc/moi"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          <Plus className="size-4" aria-hidden /> Viết bài mới
        </Link>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-neutral-200" />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  await requireAdmin("/admin/tin-tuc");
  const posts = listNewsForAdmin();
  if (posts.length === 0) {
    return <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">Chưa có bài viết nào.</p>;
  }
  return (
    <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
      {posts.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Link href={`/admin/tin-tuc/${p.id}`} className="font-medium hover:underline">
              {p.edit.title}
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <PublishBadge state={p.status} hasDraft={p.hasDraft} />
              <span className="font-mono text-xs text-neutral-400">/tin-tuc/{p.liveSlug}</span>
            </div>
            <UpdatedLine updatedAt={p.updatedAt} updatedBy={p.updatedBy} publishedAt={p.publishedAt} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            {p.status === "public" && (
              <a href={`/tin-tuc/${p.liveSlug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-900">
                Xem <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
            <Link href={`/admin/tin-tuc/${p.id}`} className="inline-flex h-9 items-center rounded-full border border-neutral-300 px-4 font-medium hover:bg-neutral-50">
              Sửa
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
