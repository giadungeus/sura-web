import type { Metadata } from "next";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { CheckoutView } from "./checkout-view";

export const metadata: Metadata = {
  title: "Thanh toán",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
      <Breadcrumb items={[{ label: "Giỏ hàng", href: "/gio-hang" }, { label: "Thanh toán" }]} />
      <h1 className="mt-3 mb-5 text-xl font-bold tracking-tight sm:text-2xl">Thanh toán</h1>
      <CheckoutView />
    </div>
  );
}
