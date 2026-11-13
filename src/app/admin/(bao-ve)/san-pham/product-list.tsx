"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Package, Pencil, Trash } from "lucide-react";
import { VisibilityBadge } from "@/components/admin/form-ui";
import { formatNumber, formatVND } from "@/lib/format";
import type { AdminProductListItem } from "@/lib/server/admin-catalog";
import { deleteProductsAction, toggleProductAction, type BulkDeleteResult } from "../../catalog-actions";

const priceRange = (min: number | null, max: number | null) =>
  min === null ? "—" : min === max ? formatVND(min) : `${formatVND(min)} – ${formatVND(max!)}`;

/**
 * Danh sách sản phẩm của MỘT trang (theo bộ lọc/tìm kiếm đang dùng) kèm chọn & xoá hàng loạt.
 * Trang cha đặt `key` theo trang + bộ lọc + tìm kiếm → đổi trang/bộ lọc là bỏ hết lựa chọn cũ.
 * Chỉ chọn được sản phẩm đang hiển thị trên trang này. Máy chủ kiểm tra quyền và quy tắc xoá cho từng sản phẩm.
 */
export function ProductList({ items, pendingCategoryName }: { items: AdminProductListItem[]; pendingCategoryName: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<BulkDeleteResult | null>(null);
  const [pending, start] = useTransition();
  const allOnPage = items.length > 0 && items.every((p) => selected.has(p.id));
  const someOnPage = items.some((p) => selected.has(p.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(items.map((p) => p.id)));

  const remove = () => {
    // Chỉ những sản phẩm đã chọn VÀ đang hiển thị trên trang này.
    const ids = items.filter((p) => selected.has(p.id)).map((p) => p.id);
    if (!ids.length) return;
    if (!window.confirm(`Xoá vĩnh viễn ${ids.length} sản phẩm đã chọn? Không thể hoàn tác. Sản phẩm đã có trong đơn hàng sẽ không bị xoá.`)) return;
    start(async () => {
      try {
        const r = await deleteProductsAction(ids);
        setResult(r);
        // Sản phẩm không xoá được vẫn được chọn để quản trị thấy rõ; sản phẩm đã xoá biến khỏi danh sách sau khi tải lại.
        setSelected(new Set(r.failed.map((f) => f.id)));
      } catch {
        setResult({ ok: false, deleted: 0, failed: [], message: "Mất kết nối khi xoá. Tải lại trang để xem kết quả." });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-2 sm:px-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allOnPage}
            ref={(el) => {
              if (el) el.indeterminate = !allOnPage && someOnPage;
            }}
            onChange={toggleAll}
            disabled={!items.length || pending}
            className="size-4 accent-neutral-900"
          />
          Chọn tất cả trên trang này
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-600" aria-live="polite">
            Đang chọn <b>{selected.size}</b> sản phẩm
          </span>
          <button
            type="button"
            onClick={remove}
            disabled={selected.size === 0 || pending}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash className="size-4" aria-hidden />}
            Xoá sản phẩm đã chọn ({selected.size})
          </button>
        </div>
      </div>

      {result && (
        <div role="status" className={`rounded-xl p-3 text-sm ${result.failed.length ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
          <p className="font-medium">{result.message}</p>
          {result.failed.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              {result.failed.map((f) => (
                <li key={f.id}>
                  <b>{f.name}</b>: {f.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {items.map((p) => (
          <li key={p.id} className={`flex items-center gap-3 p-3 sm:px-4 ${selected.has(p.id) ? "bg-neutral-50" : ""}`}>
            <input
              type="checkbox"
              checked={selected.has(p.id)}
              onChange={() => toggle(p.id)}
              disabled={pending}
              aria-label={`Chọn ${p.name}`}
              className="size-4 shrink-0 accent-neutral-900"
            />
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
                <span className={p.categoryName === pendingCategoryName ? "font-semibold text-amber-700" : ""}>{p.categoryName}</span> ·{" "}
                {p.variantCount} phiên bản
              </p>
              <p className="mt-0.5 text-sm">
                <span className="font-medium">{priceRange(p.minPrice, p.maxPrice)}</span>
                <span className={`ml-2 text-xs ${p.totalStock === 0 ? "font-semibold text-brand-600" : "text-neutral-500"}`}>
                  {p.variantCount === 0 ? "Chưa có giá/tồn kho" : p.totalStock === 0 ? "Hết hàng" : `Tồn ${formatNumber(p.totalStock)}`}
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
    </div>
  );
}
