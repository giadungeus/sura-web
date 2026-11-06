import { Suspense } from "react";
import type { Metadata } from "next";
import { formatDateTime } from "@/lib/format-date";
import { requireAdmin } from "@/lib/server/admin-auth";
import { listPackageImports } from "@/lib/server/package/service";
import { getPreviewContext } from "@/lib/server/site-content";
import { PackageImportClient } from "./package-client";

export const metadata: Metadata = { title: "Nhập gói nội dung" };

const STATUS: Record<string, string> = { staging: "Chờ xác nhận", applied: "Đã nhập", cancelled: "Đã bỏ" };

export default function PackageImportPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Nhập gói nội dung</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Tải một gói ZIP (bài sản phẩm, tin tức, trang nội dung kèm ảnh) → xem trước → chọn Lưu nháp hoặc Công khai. Gói
          không đổi giá, tồn kho, SKU, phiên bản hay danh mục.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-neutral-200" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireAdmin("/admin/nhap-goi");
  const { vars, hiddenPaths } = getPreviewContext();
  const recent = listPackageImports(8);
  return (
    <>
      <PackageImportClient vars={vars} hiddenPaths={hiddenPaths} pending={recent.filter((r) => r.status === "staging")} />
      <section className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4 text-sm sm:p-5">
        <h2 className="font-semibold">Định dạng gói</h2>
        <ul className="list-disc space-y-1 pl-5 text-neutral-600">
          <li>
            ZIP tối đa 10 MB: <code>goi.json</code> ở gốc, bài viết <code>.md</code> trong <code>bai/</code>, ảnh JPEG/PNG/WebP trong{" "}
            <code>anh/</code> (tối đa 5 MB/ảnh trước tối ưu).
          </li>
          <li>Ảnh được tối ưu WebP: ảnh đại diện/sản phẩm ≤ 1200px (mục tiêu 50–150 KB), ảnh trong bài ≤ 1400px (100–250 KB), tối đa 500 KB.</li>
          <li>Tài liệu đầy đủ và gói mẫu: thư mục <code>docs/goi-noi-dung/</code> trong mã nguồn.</li>
        </ul>
        {recent.length > 0 && (
          <>
            <h3 className="pt-2 font-medium">Lượt nhập gần đây</h3>
            <ul className="divide-y divide-neutral-100 text-neutral-600">
              {recent.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate">{r.name || r.fileName}</span>
                  <span className="text-xs text-neutral-500">
                    {STATUS[r.status] ?? r.status} · {formatDateTime(r.createdAt)} · {r.admin}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
