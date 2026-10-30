import { CartHydrator } from "@/components/cart/cart-hydrator";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

/** Khung giao diện của cửa hàng: header, nội dung, footer và giỏ hàng. */
export function ShopChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartHydrator />
    </>
  );
}
