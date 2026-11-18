import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DeleteSection } from "@/components/admin/delete-section";
import { Notice, VisibilityBadge } from "@/components/admin/form-ui";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getAdminProduct, getProductDeleteInfo, listAdminCategories, productPublishBlockers } from "@/lib/server/admin-catalog";
import { deleteProductAction, toggleProductAction } from "../../../catalog-actions";
import { getProductDraftInfo } from "@/lib/server/package/service";
import { getPreviewContext } from "@/lib/server/site-content";
import { ProductForm } from "../product-form";
import { ProductDraftBox } from "./product-draft";
import { PackageImportClient } from "../../nhap-goi/package-client";

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
  const draft = getProductDraftInfo(product.id);
  const deleteInfo = getProductDeleteInfo(product.id);
  // Sản phẩm chưa có giá/tồn kho (vd. tạo từ gói chưa ghi giá): ghi rõ điều còn thiếu trước khi Hiện.
  const blockers = product.isVisible ? [] : productPublishBlockers(product.id);
  const { vars, hiddenPaths } = getPreviewContext();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{product.name}</h1>
          <p className="text-xs text-neutral-500">
            Mã sản phẩm: {product.id}
            {product.source && ` · Nguồn: ${product.source} / ${product.sourceCode}`}
          </p>
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
      {sp["da-cap-nhat-zip"] && <Notice>Đã cập nhật sản phẩm từ gói ZIP. Danh mục và trạng thái Ẩn/Hiện giữ nguyên.</Notice>}
      {/* Cập nhật từ ZIP: dùng lại trình nhập gói; gói phải đúng một mục khớp sản phẩm này (máy chủ kiểm tra). */}
      <details className="group rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <summary className="cursor-pointer list-none font-semibold">
          Cập nhật từ ZIP <span className="font-normal text-neutral-500">— bài viết, ảnh, video, biến thể của riêng sản phẩm này</span>
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-neutral-500">
            Gói chỉ được có đúng một mục <code>&quot;loai&quot;: &quot;san_pham&quot;</code> trỏ tới sản phẩm này (theo <code>slug</code>{" "}
            <code>{product.slug}</code>
            {product.source && (
              <>
                {" "}
                hoặc <code>nguon</code>/<code>ma_san_pham</code> {product.source}/{product.sourceCode}
              </>
            )}
            ). Xem trước rồi mới ghi; danh mục và Ẩn/Hiện giữ nguyên.
          </p>
          <PackageImportClient vars={vars} hiddenPaths={hiddenPaths} pending={[]} target={{ id: product.id, name: product.name }} />
        </div>
      </details>
      {blockers.length > 0 && (
        <div role={sp["chua-hien"] ? "alert" : undefined} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">{sp["chua-hien"] ? "Chưa thể hiện sản phẩm — còn thiếu:" : "Cần bổ sung trước khi hiện sản phẩm:"}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            Nhập giá bán, tồn kho, SKU trong form dưới, bấm Lưu, rồi bấm “Hiện sản phẩm”.
          </p>
        </div>
      )}
      {/* key: dựng lại form từ dữ liệu mới nhất sau mỗi lần lưu/ẩn/hiện. */}
      {draft && <ProductDraftBox productId={product.id} draft={draft} vars={vars} hiddenPaths={hiddenPaths} />}
      <ProductForm key={product.updatedAt} categories={categories} initial={product} vars={vars} hiddenPaths={hiddenPaths} />
      <DeleteSection
        action={deleteProductAction}
        id={product.id}
        kind="sản phẩm"
        name={product.name}
        blockedReason={
          deleteInfo.orderCount > 0
            ? `Không thể xoá vì sản phẩm đã có trong ${deleteInfo.orderCount} đơn hàng — cần giữ nguyên lịch sử đơn. Nếu không bán nữa, hãy dùng nút “${product.isVisible ? "Ẩn sản phẩm" : "Hiện sản phẩm"}” ở đầu trang (sản phẩm Ẩn không hiện trên cửa hàng).`
            : deleteInfo.pendingImageJobs > 0
              ? `Chưa thể xoá: còn ${deleteInfo.pendingImageJobs} ảnh đang chờ tải từ lượt nhập CSV. Hãy chờ tải xong rồi thử lại.`
              : null
        }
        note="Sản phẩm chưa có trong đơn hàng nào. Xoá sẽ bỏ sản phẩm, các phiên bản và ảnh riêng của sản phẩm (ảnh còn được nội dung khác dùng sẽ được giữ). Lịch sử nhập gói vẫn còn."
      />
    </>
  );
}
