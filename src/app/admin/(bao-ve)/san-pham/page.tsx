import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Package, Pencil, Plus, Search } from "lucide-react";
import { Notice, VisibilityBadge } from "@/components/admin/form-ui";
import { formatNumber, formatVND } from "@/lib/format";
import { requireAdmin } from "@/lib/server/admin-auth";
import { listAdminCategories, listAdminProducts, type ProductStatusFilter } from "@/lib/server/admin-catalog";
import { toggleProductAction } from "../../catalog-actions";

export const metadata: Metadata = { title: "Sản phẩm" };

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const STATUS: { value: ProductStatusFilter | ""; label: string }[] = [
  { value: "", label: "Tất cả" },
  { value: "hien", label: "Đang hiện" },
  { value: "an", label: "Đang ẩn" },
  { value: "het-hang", label: "Hết hàng" },
];

export default function AdminProductsPage({ searchParams }: PageProps<"/admin/san-pham">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />}>
      <ProductsContent searchParams={searchParams} />
    </Suspense>
  );
}

function href(p: { q?: string; dm?: number; tt?: string; trang?: number }) {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.dm) sp.set("dm", String(p.dm));
  if (p.tt) sp.set("tt", p.tt);
  if (p.trang && p.trang > 1) sp.set("trang", String(p.trang));
  const s = sp.toString();
  return s ? `/admin/san-pham?${s}` : "/admin/san-pham";
}

const priceRange = (min: number | null, max: number | null) =>
  min === null ? "—" : min === max ? formatVND(min) : `${formatVND(min)} – ${formatVND(max!)}`;

async function ProductsContent({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim().slice(0, 60);
  const dmRaw = first(sp.dm);
  const dm = dmRaw && /^\d+$/.test(dmRaw) ? Number(dmRaw) : undefined;
  const ttRaw = first(sp.tt);
  const tt = STATUS.some((s) => s.value === ttRaw && s.value) ? (ttRaw as ProductStatusFilter) : undefined;
  const page = Number.parseInt(first(sp.trang) ?? "1", 10) || 1;
  await requireAdmin(href({ q, dm, tt, trang: page }));

  const categories = listAdminCategories();
  const result = listAdminProducts({ q, categoryId: dm, status: tt, page });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Sản phẩm</h1>
          <p className="text-sm text-neutral-500">{result.total} sản phẩm</p>
        </div>
        <Link
          href="/admin/san-pham/moi"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          <Plus className="size-4" aria-hidden /> Thêm sản phẩm
        </Link>
      </div>
      {typeof sp["da-xoa"] === "string" && <Notice>{sp["da-xoa"].slice(0, 200)}</Notice>}

      <Form action="/admin/san-pham" role="search" className="grid gap-2 sm:grid-cols-[1fr_220px_auto]">
        {tt && <input type="hidden" name="tt" value={tt} />}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
          <input
            name="q"
            type="search"
            defaultValue={q}
            key={q}
            maxLength={60}
            aria-label="Tìm theo tên, thương hiệu, slug hoặc SKU"
            placeholder="Tên, thương hiệu, slug hoặc SKU"
            className="h-11 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-10 text-base outline-none focus:border-neutral-900 sm:text-sm"
          />
        </div>
        <select
          name="dm"
          defaultValue={dm ?? ""}
          key={`dm-${dm}`}
          aria-label="Lọc theo danh mục"
          className="h-11 rounded-xl border border-neutral-300 bg-white px-3 text-base sm:text-sm"
        >
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {"— ".repeat(c.depth)}
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="h-11 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800">
          Lọc
        </button>
      </Form>

      <nav aria-label="Lọc theo trạng thái" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {STATUS.map((s) => {
          const active = (tt ?? "") === s.value;
          return (
            <Link
              key={s.value}
              href={href({ q, dm, tt: s.value || undefined })}
              aria-current={active ? "true" : undefined}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap ${
                active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white hover:border-neutral-400"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>

      {result.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
          <Package className="size-10 text-neutral-300" aria-hidden />
          <p className="font-medium">Không có sản phẩm phù hợp</p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {result.items.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-3 sm:px-4">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                {p.imageUrl ? (
                  <Image src={p.imageUrl} alt="" fill unoptimized sizes="56px" className="object-cover" />
                ) : (
                  <Package className="absolute inset-0 m-auto size-6 text-neutral-300" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/admin/san-pham/${p.id}`} className="line-clamp-1 font-medium hover:underline">
                  {p.name}
                </Link>
                <p className="truncate text-xs text-neutral-500">
                  {p.brand && `${p.brand} · `}
                  {p.categoryName} · {p.variantCount} phiên bản
                </p>
                <p className="mt-0.5 text-sm">
                  <span className="font-medium">{priceRange(p.minPrice, p.maxPrice)}</span>
                  <span className={`ml-2 text-xs ${p.totalStock === 0 ? "font-semibold text-brand-600" : "text-neutral-500"}`}>
                    {p.totalStock === 0 ? "Hết hàng" : `Tồn ${formatNumber(p.totalStock)}`}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                <VisibilityBadge visible={p.isVisible} />
                <div className="flex gap-1.5">
                  <form action={toggleProductAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="visible" value={p.isVisible ? "0" : "1"} />
                    <button
                      type="submit"
                      className="inline-flex size-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                      aria-label={p.isVisible ? `Ẩn ${p.name}` : `Hiện ${p.name}`}
                      title={p.isVisible ? "Ẩn khỏi cửa hàng" : "Hiện trên cửa hàng"}
                    >
                      {p.isVisible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    </button>
                  </form>
                  <Link
                    href={`/admin/san-pham/${p.id}`}
                    className="inline-flex size-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                    aria-label={`Sửa ${p.name}`}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {result.totalPages > 1 && (
        <nav aria-label="Phân trang" className="flex items-center justify-center gap-2">
          {result.page > 1 ? (
            <Link href={href({ q, dm, tt, trang: result.page - 1 })} className="inline-flex size-10 items-center justify-center rounded-full border border-neutral-200 bg-white" aria-label="Trang trước">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          ) : (
            <span className="inline-flex size-10 items-center justify-center rounded-full border border-neutral-200 text-neutral-300" aria-hidden>
              <ChevronLeft className="size-4" />
            </span>
          )}
          <span className="px-3 text-sm text-neutral-600">
            Trang {result.page} / {result.totalPages}
          </span>
          {result.page < result.totalPages ? (
            <Link href={href({ q, dm, tt, trang: result.page + 1 })} className="inline-flex size-10 items-center justify-center rounded-full border border-neutral-200 bg-white" aria-label="Trang sau">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span className="inline-flex size-10 items-center justify-center rounded-full border border-neutral-200 text-neutral-300" aria-hidden>
              <ChevronRight className="size-4" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
