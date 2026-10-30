"use client";

import { useEffect } from "react";
import { CART_STORAGE_KEY, useCartStore } from "@/store/cart";

/** Nạp giỏ hàng từ localStorage và đồng bộ khi giỏ thay đổi ở tab khác. */
export function CartHydrator() {
  useEffect(() => {
    void useCartStore.persist.rehydrate();

    const onStorage = (event: StorageEvent) => {
      if (event.key === CART_STORAGE_KEY) void useCartStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}
