import type { Metadata } from "next";
import { CartView } from "./cart-view";

export const metadata: Metadata = {
  title: "Giỏ hàng",
};

export default function CartPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
      <h1 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">Giỏ hàng</h1>
      <CartView />
    </div>
  );
}
