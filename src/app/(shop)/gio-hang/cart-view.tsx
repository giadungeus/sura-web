"use client";

import Link from "next/link";
import { ShoppingCart, Trash } from "lucide-react";
import { ProductImage } from "@/components/product/product-image";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { siteConfig } from "@/config/site";
import { formatVND } from "@/lib/format";
import { selectCartCount, selectSubtotal, useCartStore } from "@/store/cart";

export function CartView() {
  const hydrated = useCartStore((s) => s.hasHydrated);
  const items = useCartStore((s) => s.items);
  const count = useCartStore(selectCartCount);
  const subtotal = useCartStore(selectSubtotal);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);

  if (!hydrated) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Đang tải giỏ hàng">
        {[0, 1].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-neutral-100" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-neutral-300 px-6 py-16 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-neutral-100">
          <ShoppingCart className="size-7 text-neutral-400" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="font-medium">Giỏ hàng của bạn đang trống</p>
          <p className="text-sm text-neutral-500">Hãy khám phá và chọn sản phẩm yêu thích nhé.</p>
        </div>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Tiếp tục mua sắm
        </Link>
      </div>
    );
  }

  const shipping = siteConfig.shipping.fee;
  const total = subtotal + shipping;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
      <section aria-label="Sản phẩm trong giỏ" className="space-y-3">
        <div className="flex items-center justify-between text-sm text-neutral-500">
          <span>{count} sản phẩm</span>
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Xóa tất cả sản phẩm khỏi giỏ hàng?")) clear();
            }}
            className="hover:text-brand-600"
          >
            Xóa tất cả
          </button>
        </div>

        <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200">
          {items.map((item) => {
            const optionText = Object.values(item.options).join(" · ");
            return (
              <li key={item.key} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                <Link href={`/san-pham/${item.slug}`} className="shrink-0">
                  <ProductImage
                    image={item.image}
                    label={item.name}
                    className="w-20 rounded-xl sm:w-24"
                    iconClassName="size-8"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/san-pham/${item.slug}`}
                        className="line-clamp-2 text-sm font-medium hover:underline"
                      >
                        {item.name}
                      </Link>
                      {optionText && <p className="mt-0.5 text-xs text-neutral-500">{optionText}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-brand-600"
                      aria-label={`Xóa ${item.name} khỏi giỏ`}
                    >
                      <Trash className="size-4" aria-hidden />
                    </button>
                  </div>
                  <p className="text-sm text-neutral-500">{formatVND(item.unitPrice)}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <QuantityStepper
                      size="sm"
                      value={item.quantity}
                      max={item.stock}
                      onChange={(q) => updateQuantity(item.key, q)}
                    />
                    <span className="font-semibold text-brand-600">
                      {formatVND(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <Link href="/" className="inline-block text-sm font-medium underline underline-offset-4">
          ← Tiếp tục mua sắm
        </Link>
      </section>

      {/* Tóm tắt đơn hàng: cố định cuối màn hình trên điện thoại. */}
      <aside
        aria-label="Tóm tắt đơn hàng"
        data-bottom-bar="cart"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:sticky lg:top-24 lg:rounded-2xl lg:border lg:p-5"
      >
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-neutral-500">Tạm tính</dt>
            <dd>{formatVND(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Phí vận chuyển</dt>
            <dd>{shipping === 0 ? "0 ₫" : formatVND(shipping)}</dd>
          </div>
          <p className="text-xs text-emerald-700">{siteConfig.shipping.label}</p>
          <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold">
            <dt>Tổng cộng</dt>
            <dd className="text-brand-600">{formatVND(total)}</dd>
          </div>
        </dl>
        <Link
          href="/thanh-toan"
          className="mt-3 flex h-12 w-full items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Tiến hành thanh toán
        </Link>
      </aside>
    </div>
  );
}
