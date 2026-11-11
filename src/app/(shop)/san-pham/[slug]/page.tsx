import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, ShieldCheck, Truck } from "lucide-react";
import { RichText } from "@/components/content/rich-text";
import { JsonLd } from "@/components/seo/json-ld";
import { getSiteChrome, getSiteSettings } from "@/lib/server/site-content";
import { breadcrumbLd, pageMetadata, productLd } from "@/lib/seo";
import { clipText, markupToPlainText, resolveSeo } from "@/lib/seo-text";
import { ProductGrid } from "@/components/product/product-card";
import { ProductImage } from "@/components/product/product-image";
import { PurchasePanel } from "@/components/product/purchase-panel";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Section } from "@/components/ui/section";
import { siteConfig } from "@/config/site";
import { getCategoryTrail, getProductBySlug, getProductVideos, getRelatedProducts } from "@/lib/data/catalog";
import { ProductGallery } from "./product-gallery";

// Không dùng generateStaticParams: sản phẩm đọc từ CSDL lúc có yêu cầu,
// nên sản phẩm thêm/sửa trong trang quản trị hiển thị ngay mà không cần build lại.

export async function generateMetadata({
  params,
}: PageProps<"/san-pham/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Không tìm thấy sản phẩm" };
  const { brandName } = await getSiteSettings();
  const { title, description } = resolveSeo(product, { name: product.name, description: product.shortDescription || product.description }, brandName);
  const photo = product.photos[0];
  return pageMetadata({
    path: `/san-pham/${product.slug}`,
    title,
    description,
    brand: brandName,
    image: photo ? { url: photo.url, width: photo.width, height: photo.height, alt: photo.alt || product.name } : null,
  });
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
      {/* grid-cols-1 = minmax(0,1fr): cột không giãn theo nội dung (hàng video cuộn ngang) — Safari iPhone làm trang rộng hơn màn hình nếu để cột tự co giãn. */}
        <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-10">
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

  const [trail, related, chrome, videos] = await Promise.all([
    getCategoryTrail(product.category),
    getRelatedProducts(product, 4),
    getSiteChrome(),
    getProductVideos(product.id),
  ]);
  const leafCategory = trail.at(-1);
  // Thông số hiển thị theo thứ tự thuộc tính của danh mục.
  const specRows = (leafCategory?.attributes ?? [])
    .filter((attr) => product.specs[attr.key])
    .map((attr) => ({ label: attr.label, value: product.specs[attr.key] }));

  // Dữ liệu có cấu trúc khớp nội dung đang hiển thị (mô tả ngắn, giá, còn/hết hàng).
  const visibleDescription = product.shortDescription || clipText(markupToPlainText(product.description), 300);
  return (
    <div>
      <JsonLd
        data={breadcrumbLd([
          ...trail.map((c) => ({ name: c.name, path: `/danh-muc/${c.slug}` })),
          { name: product.name, path: `/san-pham/${product.slug}` },
        ])}
      />
      <JsonLd data={productLd(product, visibleDescription)} />
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
        <Breadcrumb
          items={[
            ...trail.map((c) => ({ label: c.name, href: `/danh-muc/${c.slug}` })),
            { label: product.name },
          ]}
        />

        <div className="mt-4 grid gap-6 md:grid-cols-2 md:gap-10">
          {product.photos.length > 0 || videos.length > 0 ? (
            <ProductGallery
              photos={product.photos}
              videos={videos}
              name={product.name}
              placeholder={<ProductImage image={product.image} label={product.name} className="absolute inset-0 rounded-3xl" iconClassName="size-1/3" />}
            />
          ) : (
            <ProductImage image={product.image} label={product.name} className="rounded-3xl" iconClassName="size-1/3" />
          )}

          <div className="min-w-0 space-y-5">
            <div className="space-y-2">
              <p className="text-sm text-neutral-500">
                Thương hiệu: <span className="font-medium text-neutral-900">{product.brand}</span>
              </p>
              <h1 className="text-2xl leading-tight font-bold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
                {product.name}
              </h1>
              <p className="text-neutral-600 [overflow-wrap:anywhere]">{product.shortDescription}</p>
            </div>

            <PurchasePanel
              product={{
                id: product.id,
                slug: product.slug,
                name: product.name,
                brand: product.brand,
                optionNames: product.optionNames,
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
                <ShieldCheck className="size-4 text-neutral-400" aria-hidden />
                {product.specs["bao-hanh"] ? `Bảo hành ${product.specs["bao-hanh"]}` : siteConfig.warrantyLabel}
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
          {/* Bài mô tả đủ rộng cho ảnh và bảng; mô tả chữ thường (nhập CSV) vẫn hiển thị như trước. */}
          <section className="min-w-0 space-y-3 md:col-span-2">
            <h2 className="text-lg font-semibold">Mô tả sản phẩm</h2>
            <div className="max-w-3xl">
              <RichText source={product.description} vars={chrome.vars} hiddenPaths={chrome.hiddenPaths} />
            </div>
          </section>

          {product.highlights.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Điểm nổi bật</h2>
              <ul className="space-y-2">
                {product.highlights.map((h) => (
                  <li key={h} className="flex gap-2 text-neutral-700">
                    <Check className="mt-1 size-4 shrink-0 text-emerald-600" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {specRows.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Thông số</h2>
              <dl className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-200 text-sm">
                {specRows.map((row) => (
                  <div key={row.label} className="grid grid-cols-5 gap-3 px-4 py-3">
                    <dt className="col-span-2 text-neutral-500">{row.label}</dt>
                    <dd className="col-span-3 text-neutral-900 [overflow-wrap:anywhere]">{row.value}</dd>
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
