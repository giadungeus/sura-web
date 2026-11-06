import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PublishBadge, UpdatedLine } from "@/components/admin/publish-status";
import { requireAdmin } from "@/lib/server/admin-auth";
import { listPagesForAdmin } from "@/lib/server/site-content";

export const metadata: Metadata = { title: "Trang nội dung" };

export default function ContentPagesAdmin() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Trang nội dung</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Trang công khai hiện trong menu/chân trang; trang Nháp không truy cập được từ website.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />}>
        <List />
      </Suspense>
    </div>
  );
}

async function List() {
  await requireAdmin("/admin/noi-dung");
  const pages = listPagesForAdmin();
  return (
    <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 bg-white">
      {pages.map((p) => (
        <li key={p.slug} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Link href={`/admin/noi-dung/${p.slug}`} className="font-medium hover:underline">
              {p.label}
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <PublishBadge state={p.isPublic ? "public" : "draft"} hasDraft={p.hasDraft} />
              <span className="font-mono text-xs text-neutral-400">{p.path}</span>
            </div>
            <UpdatedLine updatedAt={p.updatedAt} updatedBy={p.updatedBy} publishedAt={p.publishedAt} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            {p.isPublic && (
              <a href={p.path} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-900">
                Xem <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
            <Link
              href={`/admin/noi-dung/${p.slug}`}
              className="inline-flex h-9 items-center rounded-full border border-neutral-300 px-4 font-medium hover:bg-neutral-50"
            >
              Sửa
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
