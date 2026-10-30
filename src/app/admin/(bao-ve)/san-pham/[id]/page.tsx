import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Notice, VisibilityBadge } from "@/components/admin/form-ui";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getAdminProduct, listAdminCategories } from "@/lib/server/admin-catalog";
import { toggleProductAction } from "../../../catalog-actions";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Sửa sản phẩm" };

type Props = PageProps<"/admin/san-pham/[id]">;

export default function EditProductPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/admin/san-pham" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="size-4" aria-hidden /> Sản phẩm
      </Link>
      <Suspense fallback={<div className="h-[40rem] animate-pulse rounded-2xl bg-neutral-200" />}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Content({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const valid = /^[a-z0-9-]{1,40}$/.test(id);
  await requireAdmin(valid ? `/admin/san-pham/${id}` : "/admin/san-pham");
  const product = valid ? getAdminProduct(id) : null;
  if (!product) {
    return <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm">Không tìm thấy sản phẩm.</p>;
  }
  const categories = listAdminCategories().map((c) => ({ id: c.id, name: c.name, depth: c.depth }));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{product.name}</h1>
          <p className="text-xs text-neutral-500">Mã sản phẩm: {product.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <VisibilityBadge visible={product.isVisible} />
          <form action={toggleProductAction}>
            <input type="hidden" name="id" value={product.id} />
            <input type="hidden" name="visible" value={product.isVisible ? "0" : "1"} />
            <button type="submit" className="h-9 rounded-full border border-neutral-300 bg-white px-3 text-sm hover:bg-neutral-50">
              {product.isVisible ? "Ẩn sản phẩm" : "Hiện sản phẩm"}
            </button>
          </form>
          <Link
            href={`/san-pham/${product.slug}`}
            target="_blank"
            rel="noopener"
            className="inline-flex h-9 items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 text-sm hover:bg-neutral-50"
          >
            Xem <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
      {sp["da-luu"] && <Notice>Đã lưu sản phẩm. Cửa hàng đã cập nhật.</Notice>}
      {/* key: dựng lại form từ dữ liệu mới nhất sau mỗi lần lưu/ẩn/hiện. */}
      <ProductForm key={product.updatedAt} categories={categories} initial={product} />
    </>
  );
}
