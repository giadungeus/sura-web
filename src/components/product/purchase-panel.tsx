"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ShoppingCart } from "lucide-react";
import { Price } from "@/components/ui/price";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { formatNumber } from "@/lib/format";
import { useCartStore } from "@/store/cart";
import type { Product, ProductVariant, SelectedOptions } from "@/types";

type PanelProduct = Pick<Product, "id" | "slug" | "name" | "brand" | "optionNames" | "variants" | "image">;

const matches = (v: ProductVariant, selected: SelectedOptions) =>
  Object.entries(v.options).every(([name, value]) => selected[name] === value);

export function PurchasePanel({ product }: { product: PanelProduct }) {
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);

  // Các giá trị của từng thuộc tính, theo thứ tự xuất hiện trong danh sách biến thể.
  const groups = useMemo(
    () =>
      product.optionNames.map((name) => ({
        name,
        values: [...new Set(product.variants.map((v) => v.options[name]).filter(Boolean))],
      })),
    [product.optionNames, product.variants],
  );

  // Mặc định chọn phiên bản còn hàng đầu tiên.
  const [selected, setSelected] = useState<SelectedOptions>(
    () => ({ ...(product.variants.find((v) => v.stock > 0) ?? product.variants[0]).options }),
  );
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const variant = product.variants.find((v) => matches(v, selected)) ?? null;
  const stock = variant?.stock ?? 0;
  const purchasable = variant !== null && stock > 0;
  const qty = Math.min(quantity, Math.max(1, stock));

  /** Một giá trị có thể chọn nếu tồn tại phiên bản còn hàng khớp với các lựa chọn khác. */
  const valueState = (name: string, value: string): "ok" | "soldout" | "none" => {
    const candidate = { ...selected, [name]: value };
    const v = product.variants.find((x) => matches(x, candidate));
    if (!v) return "none";
    return v.stock > 0 ? "ok" : "soldout";
  };

  const add = () => {
    if (!variant || !purchasable) return false;
    addItem(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        brand: product.brand,
        options: variant.options,
        unitPrice: variant.price,
        stock: variant.stock,
        image: product.image,
      },
      qty,
    );
    return true;
  };

  const handleAdd = () => {
    if (!add()) return;
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1800);
  };

  const handleBuyNow = () => {
    if (add()) router.push("/gio-hang");
  };

  const statusText = !variant
    ? "Phiên bản này hiện không có"
    : stock <= 0
      ? "Hết hàng"
      : `Còn ${formatNumber(stock)} sản phẩm`;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-neutral-50 p-4">
        {variant ? (
          <Price price={variant.price} originalPrice={variant.compareAtPrice} size="lg" showBadge />
        ) : (
          <p className="text-lg font-semibold text-neutral-400">Chọn phiên bản khác</p>
        )}
        {variant && groups.length > 0 && <p className="mt-1 text-xs text-neutral-500">Mã SKU: {variant.sku}</p>}
      </div>

      {groups.map((group) => (
        <fieldset key={group.name}>
          <legend className="mb-2 text-sm text-neutral-500">
            {group.name}: <span className="font-medium text-neutral-900">{selected[group.name]}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {group.values.map((value) => {
              const active = selected[group.name] === value;
              const state = valueState(group.name, value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelected((prev) => ({ ...prev, [group.name]: value }))}
                  aria-pressed={active}
                  title={state === "soldout" ? "Hết hàng" : state === "none" ? "Không có với lựa chọn hiện tại" : undefined}
                  className={`min-w-12 rounded-xl border px-3.5 py-2 text-sm transition ${
                    active
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : state === "ok"
                        ? "border-neutral-200 text-neutral-700 hover:border-neutral-400"
                        : "border-dashed border-neutral-200 text-neutral-400 line-through"
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm text-neutral-500">Số lượng</span>
        <QuantityStepper value={qty} max={Math.max(1, stock)} onChange={setQuantity} />
        <span className={`text-xs ${purchasable ? "text-neutral-500" : "font-medium text-brand-600"}`}>{statusText}</span>
      </div>

      {/* Trên điện thoại, nút mua cố định ở cuối màn hình. */}
      <div
        data-bottom-bar="product"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:static md:border-0 md:bg-transparent md:p-0"
      >
        <div className="mx-auto flex max-w-6xl gap-3">
          <button
            type="button"
            onClick={handleAdd}
            disabled={!purchasable}
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
            disabled={!purchasable}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
          >
            {purchasable ? "Mua ngay" : "Hết hàng"}
          </button>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {justAdded ? "Đã thêm sản phẩm vào giỏ hàng" : ""}
      </p>
    </div>
  );
}
