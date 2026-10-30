import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, RotateCcw, ShieldCheck, Star, Truck } from "lucide-react";
import { ProductGrid } from "@/components/product/product-card";
import { ProductImage } from "@/components/product/product-image";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config/site";
import { formatNumber, formatSold } from "@/lib/format";
import {
  getCategoryTrail,
  getProductBySlug,
  getProducts,
  getRelatedProducts,
} from "@/lib/data/catalog";

export async function generateStaticParams() {
  const products = await getProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/san-pham/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Không tìm thấy sản phẩm" };
  return { title: product.name, description: product.shortDescription };
}

type Props = PageProps<"/san-pham/[slug]">;

// Phần đọc `params` nằm trong Suspense để điều hướng hiển thị khung trang ngay.
export default function ProductPage({ params }: Props) {
  return (
    <Suspense fallback={<ProductSkeleton />}>
      <ProductContent params={params} />
    </Suspense>
  );
}

function ProductSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6" aria-busy="true">
      <div className="h-4 w-56 animate-pulse rounded bg-neutral-100" />
      <div className="mt-4 grid gap-6 md:grid-cols-2 md:gap-10">
        <div className="aspect-square animate-pulse rounded-3xl bg-neutral-100" />
        <div className="space-y-4">
          <div className="h-8 w-3/4 animate-pulse rounded bg-neutral-100" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-100" />
          <div className="h-20 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="h-10 w-2/3 animate-pulse rounded bg-neutral-100" />
        </div>
      </div>
    </div>
  );
}

async function ProductContent({ params }: Pick<Props, "params">) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const [trail, related] = await Promise.all([
    getCategoryTrail(product.category),
    getRelatedProducts(product, 4),
  ]);
  const leafCategory = trail.at(-1);
  // Thông số hiển thị theo thứ tự thuộc tính của danh mục.
  const specRows = (leafCategory?.attributes ?? [])
    .filter((attr) => product.specs[attr.key])
    .map((attr) => ({ label: attr.label, value: product.specs[attr.key] }));

  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
        <Breadcrumb
          items={[
            ...trail.map((c) => ({ label: c.name, href: `/danh-muc/${c.slug}` })),
            { label: product.name },
          ]}
        />

        <div className="mt-4 grid gap-6 md:grid-cols-2 md:gap-10">
          <ProductImage
            image={product.image}
            label={product.name}
            className="rounded-3xl"
            iconClassName="size-1/3"
          />

          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm text-neutral-500">
                Thương hiệu: <span className="font-medium text-neutral-900">{product.brand}</span>
              </p>
              <h1 className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl">
                {product.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
                <span className="flex items-center gap-1">
                  <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                  <span className="font-medium text-neutral-900">{product.rating.toFixed(1)}</span>
                  <span>({formatNumber(product.reviewCount)} đánh giá)</span>
                </span>
                <span className="text-neutral-300">|</span>
                <span>Đã bán {formatSold(product.sold)}</span>
              </div>
              <p className="text-neutral-600">{product.shortDescription}</p>
            </div>

            <PurchasePanel
              product={{
                id: product.id,
                slug: product.slug,
                name: product.name,
                brand: product.brand,
                price: product.price,
                originalPrice: product.originalPrice,
                stock: product.stock,
                variants: product.variants,
                image: product.image,
              }}
            />

            <ul className="space-y-2 rounded-2xl border border-neutral-200 p-4 text-sm text-neutral-600">
              <li className="flex items-center gap-2">
                <Truck className="size-4 text-neutral-400" aria-hidden />
                {siteConfig.shipping.shortLabel}
              </li>
              <li className="flex items-center gap-2">
                <RotateCcw className="size-4 text-neutral-400" aria-hidden />
                Đổi trả miễn phí trong 7 ngày
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-neutral-400" aria-hidden />
                {product.specs["bao-hanh"]
                  ? `Bảo hành ${product.specs["bao-hanh"]}`
                  : "Cam kết hàng chính hãng"}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-2 md:gap-10">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Mô tả sản phẩm</h2>
            <p className="leading-7 text-neutral-700">{product.description}</p>
            <ul className="space-y-2">
              {product.highlights.map((h) => (
                <li key={h} className="flex gap-2 text-neutral-700">
                  <Check className="mt-1 size-4 shrink-0 text-emerald-600" aria-hidden />
                  {h}
                </li>
              ))}
            </ul>
          </section>

          {specRows.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Thông số</h2>
              <dl className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 text-sm">
                {specRows.map((row) => (
                  <div key={row.label} className="grid grid-cols-5 gap-3 px-4 py-3">
                    <dt className="col-span-2 text-neutral-500">{row.label}</dt>
                    <dd className="col-span-3 text-neutral-900">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <Section
          title="Sản phẩm liên quan"
          href={leafCategory ? `/danh-muc/${leafCategory.slug}` : undefined}
        >
          <ProductGrid products={related} />
        </Section>
      )}
    </div>
  );
}
