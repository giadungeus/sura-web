"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { selectCartCount, useCartStore } from "@/store/cart";

export function CartButton() {
  const count = useCartStore(selectCartCount);
  const hydrated = useCartStore((s) => s.hasHydrated);
  const visibleCount = hydrated ? count : 0;

  return (
    <Link
      href="/gio-hang"
      className="relative inline-flex size-10 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
      aria-label={visibleCount > 0 ? `Giỏ hàng, ${visibleCount} sản phẩm` : "Giỏ hàng"}
    >
      <ShoppingCart className="size-5" aria-hidden />
      {visibleCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-semibold text-white">
          {visibleCount > 99 ? "99+" : visibleCount}
        </span>
      )}
    </Link>
  );
}
