import { Suspense } from "react";
import { CartHydrator } from "@/components/cart/cart-hydrator";
import { ContactDock } from "@/components/layout/contact-dock";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { chatbotActive } from "@/lib/server/chat/config";
import { getSiteSettings } from "@/lib/server/site-content";

/** Khung giao diện của cửa hàng: header, nội dung, footer, nút hỗ trợ và giỏ hàng. */
export function ShopChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <Suspense fallback={null}>
        <ContactDockLoader />
      </Suspense>
      <CartHydrator />
    </>
  );
}

async function ContactDockLoader() {
  const s = await getSiteSettings();
  return (
    <ContactDock
      contact={{ hotline: s.hotline, phoneHref: s.phoneHref, zaloHref: s.zaloHref, emailHref: s.emailHref }}
      chatEnabled={chatbotActive()}
    />
  );
}
