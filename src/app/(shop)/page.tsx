import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/json-ld";
import { getSiteSettings } from "@/lib/server/site-content";
import { organizationLd, pageMetadata } from "@/lib/seo";
import { HandCoins, ShieldCheck, Truck } from "lucide-react";
import { CategoryIcon } from "@/components/icons";
import { ProductGrid, ProductGridSkeleton } from "@/components/product/product-card";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config/site";
import { getNewestProducts, getRootCategories } from "@/lib/data/catalog";
import { HOME_SECTIONS, getHomeSectionProducts, type HomeSection } from "@/lib/server/home-picks";

const PERKS = [
  { icon: Truck, text: siteConfig.shipping.shortLabel },
  { icon: ShieldCheck, text: siteConfig.warrantyLabel },
  { icon: HandCoins, text: siteConfig.paymentLabel },
];

export async function generateMetadata(): Promise<Metadata> {
  const { brandName, footerDescription } = await getSiteSettings();
  return pageMetadata({
    path: "/",
    title: `${brandName} – Mua sắm đa ngành, ${siteConfig.shipping.label.toLowerCase()}`,
    description: footerDescription || siteConfig.description,
    brand: brandName,
  });
}

/** Thông tin cửa hàng (Cài đặt website) dưới dạng dữ liệu có cấu trúc. */
async function StoreJsonLd() {
  return <JsonLd data={organizationLd(await getSiteSettings())} />;
}

export default function HomePage() {
  return (
    <>
      <Suspense fallback={null}>
        <StoreJsonLd />
      </Suspense>
      {/* Banner */}
      <section className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
        <div className="relative overflow-hidden rounded-3xl bg-neutral-900 px-6 py-10 text-white sm:px-10 sm:py-14">
          <div className="relative z-10 max-w-md">
            <p className="text-sm font-medium text-brand-100">Mua sắm đa ngành</p>
            <h1 className="mt-2 text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
              Mua sắm mọi thứ bạn cần tại một nơi
            </h1>
            <p className="mt-3 text-sm text-neutral-300 sm:text-base">
              Điện tử, thời trang, nhà cửa và hơn thế nữa. {siteConfig.shipping.label}.
            </p>
            <Link
              href="#danh-muc"
              className="mt-6 inline-flex h-11 items-center rounded-full bg-white px-6 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              Xem danh mục
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
      <Section id="danh-muc" title="Danh mục ngành hàng">
        <Suspense fallback={<div className="h-56 animate-pulse rounded-2xl bg-neutral-100 sm:h-28" />}>
          <RootCategories />
        </Suspense>
      </Section>

      {/* Hai khu chọn thủ công trong Quản trị → Trang chủ; không có sản phẩm hợp lệ thì ẩn cả khu. */}
      <Suspense fallback={null}>
        <PickedSection section="giam-gia" />
      </Suspense>
      <Suspense fallback={null}>
        <PickedSection section="noi-bat" />
      </Suspense>

      <Section title="Hàng mới về">
        <Suspense fallback={<ProductGridSkeleton count={4} />}>
          <ProductRow load={() => getNewestProducts(4)} />
        </Suspense>
      </Section>
    </>
  );
}

async function RootCategories() {
  const roots = await getRootCategories();
  return (
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
  );
}

async function PickedSection({ section }: { section: HomeSection }) {
  const products = await getHomeSectionProducts(section);
  if (products.length === 0) return null;
  return (
    <Section title={HOME_SECTIONS[section].label}>
      <ProductGrid products={products} />
    </Section>
  );
}

async function ProductRow({ load }: { load: () => Promise<import("@/types").Product[]> }) {
  const products = await load();
  if (products.length === 0) return <p className="text-sm text-neutral-500">Chưa có sản phẩm.</p>;
  return <ProductGrid products={products} />;
}
