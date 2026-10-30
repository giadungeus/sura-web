"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CartItem, SelectedOptions } from "@/types";

export const CART_STORAGE_KEY = "shop-online-cart";

/** Khóa ổn định cho một sản phẩm cùng bộ biến thể đã chọn. */
export function makeCartKey(productId: string, options: SelectedOptions): string {
  const parts = Object.keys(options)
    .sort()
    .map((name) => `${name}=${options[name]}`);
  return [productId, ...parts].join("|");
}

type AddInput = Omit<CartItem, "key" | "quantity">;

type CartState = {
  items: CartItem[];
  /** Đã đọc xong giỏ hàng từ localStorage hay chưa. */
  hasHydrated: boolean;
  addItem: (input: AddInput, quantity?: number) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function clampQuantity(quantity: number, stock: number): number {
  return Math.max(1, Math.min(Math.floor(quantity), stock));
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hasHydrated: false,

      addItem: (input, quantity = 1) =>
        set((state) => {
          const key = makeCartKey(input.productId, input.options);
          const existing = state.items.find((item) => item.key === key);
          if (existing) {
            return {
              items: state.items.map((item) =>
                item.key === key
                  ? { ...item, quantity: clampQuantity(item.quantity + quantity, item.stock) }
                  : item,
              ),
            };
          }
          return {
            items: [
              ...state.items,
              { ...input, key, quantity: clampQuantity(quantity, input.stock) },
            ],
          };
        }),

      updateQuantity: (key, quantity) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.key === key ? { ...item, quantity: clampQuantity(quantity, item.stock) } : item,
          ),
        })),

      removeItem: (key) =>
        set((state) => ({ items: state.items.filter((item) => item.key !== key) })),

      clear: () => set({ items: [] }),
    }),
    {
      name: CART_STORAGE_KEY,
      version: 1,
      // Chỉ dùng localStorage của trình duyệt (Node 26 cũng có biến `localStorage` toàn cục).
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({ items: state.items }),
      // Đọc localStorage sau khi trang đã hydrate để tránh lệch HTML giữa server và trình duyệt.
      skipHydration: true,
      onRehydrateStorage: () => () => {
        useCartStore.setState({ hasHydrated: true });
      },
    },
  ),
);

/** Tổng số lượng sản phẩm trong giỏ. */
export const selectCartCount = (state: CartState) =>
  state.items.reduce((sum, item) => sum + item.quantity, 0);

/** Tạm tính (VNĐ). */
export const selectSubtotal = (state: CartState) =>
  state.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
