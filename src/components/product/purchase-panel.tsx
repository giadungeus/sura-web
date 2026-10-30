"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ShoppingCart } from "lucide-react";
import { Price } from "@/components/ui/price";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { formatNumber } from "@/lib/format";
import { useCartStore } from "@/store/cart";
import type { Product, SelectedOptions } from "@/types";

type PanelProduct = Pick<
  Product,
  "id" | "slug" | "name" | "brand" | "price" | "originalPrice" | "stock" | "variants" | "image"
>;

function defaultOptions(product: PanelProduct): SelectedOptions {
  const result: SelectedOptions = {};
  for (const group of product.variants ?? []) result[group.name] = group.options[0].label;
  return result;
}

function priceDelta(product: PanelProduct, selected: SelectedOptions): number {
  let delta = 0;
  for (const group of product.variants ?? []) {
    const option = group.options.find((o) => o.label === selected[group.name]);
    delta += option?.priceDelta ?? 0;
  }
  return delta;
}

export function PurchasePanel({ product }: { product: PanelProduct }) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const [selected, setSelected] = useState<SelectedOptions>(() => defaultOptions(product));
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const delta = priceDelta(product, selected);
  const unitPrice = product.price + delta;
  const originalPrice = product.originalPrice ? product.originalPrice + delta : undefined;
  const outOfStock = product.stock <= 0;

  const add = () => {
    addItem(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        brand: product.brand,
        options: selected,
        unitPrice,
        stock: product.stock,
        image: product.image,
      },
      quantity,
    );
  };

  const handleAdd = () => {
    add();
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1800);
  };

  const handleBuyNow = () => {
    add();
    router.push("/gio-hang");
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-neutral-50 p-4">
        <Price price={unitPrice} originalPrice={originalPrice} size="lg" showBadge />
      </div>

      {product.variants?.map((group) => (
        <fieldset key={group.name}>
          <legend className="mb-2 text-sm text-neutral-500">
            {group.name}: <span className="font-medium text-neutral-900">{selected[group.name]}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {group.options.map((option) => {
              const active = selected[group.name] === option.label;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setSelected((prev) => ({ ...prev, [group.name]: option.label }))}
                  aria-pressed={active}
                  className={`min-w-12 rounded-xl border px-3.5 py-2 text-sm transition ${
                    active
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 text-neutral-700 hover:border-neutral-400"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex items-center gap-4">
        <span className="text-sm text-neutral-500">Số lượng</span>
        <QuantityStepper value={quantity} max={Math.max(1, product.stock)} onChange={setQuantity} />
        <span className="text-xs text-neutral-500">Còn {formatNumber(product.stock)} sản phẩm</span>
      </div>

      {/* Trên điện thoại, nút mua cố định ở cuối màn hình. */}
      <div
        data-bottom-bar="product"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-6xl gap-3">
          <button
            type="button"
            onClick={handleAdd}
            disabled={outOfStock}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-neutral-900 text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-40"
          >
            {justAdded ? (
              <>
                <Check className="size-4" aria-hidden /> Đã thêm
              </>
            ) : (
              <>
                <ShoppingCart className="size-4" aria-hidden /> Thêm vào giỏ
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleBuyNow}
            disabled={outOfStock}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            {outOfStock ? "Hết hàng" : "Mua ngay"}
          </button>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {justAdded ? "Đã thêm sản phẩm vào giỏ hàng" : ""}
      </p>
    </div>
  );
}
