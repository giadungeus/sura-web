import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DeleteSection } from "@/components/admin/delete-section";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getAdminCategory, getCategoryContentForAdmin, listAdminCategories } from "@/lib/server/admin-catalog";
import { getPreviewContext } from "@/lib/server/site-content";
import { deleteCategoryAction } from "../../../catalog-actions";
import { CategoryContentEditor } from "../category-content-editor";
import { CategoryForm } from "../category-form";

export const metadata: Metadata = { title: "Sửa danh mục" };

type Props = PageProps<"/admin/danh-muc/[id]">;

export default function EditCategoryPage({ params }: Props) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin/danh-muc" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="size-4" aria-hidden /> Danh mục
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />}>
        <Content params={params} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: Pick<Props, "params">) {
  const { id: raw } = await params;
  const id = /^\d+$/.test(raw) ? Number(raw) : null;
  await requireAdmin(id ? `/admin/danh-muc/${id}` : "/admin/danh-muc");
  const category = id ? getAdminCategory(id) : null;
  if (!category) {
    return <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm">Không tìm thấy danh mục.</p>;
  }
  const content = getCategoryContentForAdmin(category.id)!;
  const preview = getPreviewContext();
  const parents = listAdminCategories()
    .filter((c) => c.id !== category.id)
    .map((c) => ({ id: c.id, name: c.name, depth: c.depth }));
  return (
    <>
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Sửa “{category.name}”</h1>
      <CategoryForm
        parents={parents}
        initial={{
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          icon: category.icon,
          parentId: category.parentId,
          sortOrder: category.sortOrder,
          isVisible: category.isVisible,
          everPublic: category.everPublic,
        }}
      />
      <CategoryContentEditor
        key={content.updatedAt}
        categoryId={category.id}
        name={category.name}
        slug={category.slug}
        isVisible={category.isVisible}
        content={content}
        vars={preview.vars}
        hiddenPaths={preview.hiddenPaths}
      />
      <DeleteSection
        action={deleteCategoryAction}
        id={category.id}
        kind="danh mục"
        name={category.name}
        blockedReason={
          category.productCount > 0 || category.childCount > 0
            ? `Không thể xoá vì danh mục ${[
                category.productCount > 0 && `còn ${category.productCount} sản phẩm (kể cả sản phẩm đang Ẩn)`,
                category.childCount > 0 && `còn ${category.childCount} danh mục con`,
              ]
                .filter(Boolean)
                .join(" và ")}. Hãy chuyển sản phẩm sang danh mục khác (hoặc xoá sản phẩm chưa có đơn) và xử lý các danh mục con trước; hoặc dùng “Ẩn” trong form trên.`
            : null
        }
        note="Danh mục không còn sản phẩm hay danh mục con."
      />
    </>
  );
}
