import { Suspense } from "react";
import type { Metadata } from "next";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { getSiteSettings } from "@/lib/server/site-content";
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
      <Suspense
        fallback={
          <div className="space-y-3" aria-busy="true" aria-label="Đang tải">
            <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
            <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
          </div>
        }
      >
        <Checkout />
      </Suspense>
    </div>
  );
}

/** Tên thương hiệu lấy từ Cài đặt website (đọc lúc có yêu cầu). */
async function Checkout() {
  const { brandName } = await getSiteSettings();
  return <CheckoutView brandName={brandName} />;
}
