import { ShopChrome } from "@/components/layout/shop-chrome";

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return <ShopChrome>{children}</ShopChrome>;
}
