import Link from "next/link";
import { RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { CategoryIcon } from "@/components/icons";
import { ProductGrid } from "@/components/product/product-card";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config/site";
import { formatVND } from "@/lib/format";
import {
  getFeaturedProducts,
  getNewestProducts,
  getRootCategories,
  getTopDiscountProducts,
} from "@/lib/data/catalog";

const PERKS = [
  { icon: Truck, text: `Miễn phí giao hàng từ ${formatVND(siteConfig.freeShippingThreshold)}` },
  { icon: RotateCcw, text: "Đổi trả miễn phí 7 ngày" },
  { icon: ShieldCheck, text: "Hàng chính hãng 100%" },
];

export default async function HomePage() {
  const [roots, deals, featured, newest] = await Promise.all([
    getRootCategories(),
    getTopDiscountProducts(4),
    getFeaturedProducts(8),
    getNewestProducts(4),
  ]);

  return (
    <>
      {/* Banner */}
      <section className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
        <div className="relative overflow-hidden rounded-3xl bg-neutral-900 px-6 py-10 text-white sm:px-10 sm:py-14">
          <div className="relative z-10 max-w-md">
            <p className="text-sm font-medium text-brand-100">Ưu đãi mùa thu</p>
            <h1 className="mt-2 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
              Mua sắm mọi thứ bạn cần, giá tốt mỗi ngày
            </h1>
            <p className="mt-3 text-sm text-neutral-300 sm:text-base">
              Giảm đến 30% cho điện tử, thời trang, gia dụng và hơn thế nữa.
            </p>
            <Link
              href="/danh-muc/dien-tu"
              className="mt-6 inline-flex h-11 items-center rounded-full bg-white px-6 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              Mua ngay
            </Link>
          </div>
          <div
            aria-hidden
            className="absolute -top-16 -right-16 size-64 rounded-full bg-brand-600/40 blur-3xl sm:size-96"
          />
        </div>

        <ul className="no-scrollbar mt-4 flex gap-3 overflow-x-auto text-sm text-neutral-600 sm:grid sm:grid-cols-3">
          {PERKS.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="flex shrink-0 items-center gap-2 rounded-full bg-neutral-50 px-4 py-2 sm:justify-center"
            >
              <Icon className="size-4 text-neutral-500" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      </section>

      {/* Ngành hàng */}
      <Section title="Danh mục ngành hàng">
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {roots.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/danh-muc/${c.slug}`}
                className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 px-2 py-4 text-center text-xs font-medium hover:border-neutral-300 hover:bg-neutral-50 sm:text-sm"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
                  <CategoryIcon icon={c.icon} className="size-6" />
                </span>
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Giảm giá sốc">
        <ProductGrid products={deals} />
      </Section>

      <Section title="Sản phẩm nổi bật">
        <ProductGrid products={featured} />
      </Section>

      <Section title="Hàng mới về">
        <ProductGrid products={newest} />
      </Section>
    </>
  );
}
