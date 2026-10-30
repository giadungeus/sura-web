import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { Notice, VisibilityBadge } from "@/components/admin/form-ui";
import { CategoryIcon } from "@/components/icons";
import { requireAdmin } from "@/lib/server/admin-auth";
import { listAdminCategories } from "@/lib/server/admin-catalog";
import { toggleCategoryAction } from "../../catalog-actions";
import { DeleteCategoryButton } from "./delete-button";

export const metadata: Metadata = { title: "Danh mục" };

export default function AdminCategoriesPage({ searchParams }: PageProps<"/admin/danh-muc">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />}>
      <CategoriesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CategoriesContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  await requireAdmin("/admin/danh-muc");
  const categories = listAdminCategories();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Danh mục</h1>
          <p className="text-sm text-neutral-500">{categories.length} danh mục · sắp xếp theo “Thứ tự” (số nhỏ đứng trước)</p>
        </div>
        <Link
          href="/admin/danh-muc/moi"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          <Plus className="size-4" aria-hidden /> Thêm danh mục
        </Link>
      </div>

      {sp["da-luu"] && <Notice>Đã lưu danh mục.</Notice>}
      {sp["da-xoa"] && <Notice>Đã xoá danh mục.</Notice>}

      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {categories.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:flex-nowrap sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-3" style={{ paddingLeft: `${c.depth * 1.5}rem` }}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600">
                <CategoryIcon icon={c.icon} className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {c.depth > 0 && <span className="text-neutral-300">└ </span>}
                  {c.name}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  /{c.slug} · thứ tự {c.sortOrder} · {c.productCount} sản phẩm
                  {c.childCount > 0 && ` · ${c.childCount} danh mục con`}
                </p>
              </div>
            </div>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <VisibilityBadge visible={c.isVisible} />
              <form action={toggleCategoryAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="visible" value={c.isVisible ? "0" : "1"} />
                <button
                  type="submit"
                  className="inline-flex size-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                  aria-label={c.isVisible ? `Ẩn ${c.name}` : `Hiện ${c.name}`}
                  title={c.isVisible ? "Ẩn danh mục" : "Hiện danh mục"}
                >
                  {c.isVisible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </form>
              <Link
                href={`/admin/danh-muc/${c.id}`}
                className="inline-flex size-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                aria-label={`Sửa ${c.name}`}
                title="Sửa"
              >
                <Pencil className="size-4" aria-hidden />
              </Link>
              <DeleteCategoryButton id={c.id} name={c.name} disabled={c.productCount > 0 || c.childCount > 0} />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-neutral-500">
        Ẩn danh mục sẽ ẩn cả danh mục con và sản phẩm bên trong khỏi cửa hàng. Chỉ xoá được danh mục không còn sản phẩm và
        danh mục con.
      </p>
    </div>
  );
}
