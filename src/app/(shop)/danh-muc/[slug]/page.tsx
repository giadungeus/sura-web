import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/icons";
import { ProductListing } from "@/components/listing/product-listing";
import { ProductGridSkeleton } from "@/components/product/product-card";
import { JsonLd } from "@/components/seo/json-ld";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { RichText } from "@/components/content/rich-text";
import { getSiteChrome, getSiteSettings } from "@/lib/server/site-content";
import { breadcrumbLd, pageMetadata } from "@/lib/seo";
import { resolveSeo } from "@/lib/seo-text";
import {
  getCategoryBySlug,
  getCategoryTrail,
  getChildCategories,
  getProductsByCategory,
} from "@/lib/data/catalog";
import { listingUrlState, parseListingParams, type SearchParamsRecord } from "@/lib/listing";

// Không dùng generateStaticParams: danh mục đọc từ CSDL lúc có yêu cầu.

export async function generateMetadata({ params, searchParams }: PageProps<"/danh-muc/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Không tìm thấy danh mục" };
  const [products, query, { brandName }] = await Promise.all([getProductsByCategory(slug), searchParams, getSiteSettings()]);
  const state = listingUrlState(query, products);
  if (!state.valid) return { title: "Không tìm thấy trang", robots: { index: false, follow: false } };
  const { title, description } = resolveSeo(category, { name: category.name, description: category.description }, brandName);
  return pageMetadata({
    // Trang lọc/sắp xếp: không canonical, không lập chỉ mục. Trang phân trang: canonical là chính nó.
    path: state.filtered ? null : state.page > 1 ? `/danh-muc/${category.slug}?trang=${state.page}` : `/danh-muc/${category.slug}`,
    title,
    description,
    brand: brandName,
    // Danh mục chưa có sản phẩm: không lập chỉ mục (theo hướng dẫn của Google).
    noindex: state.filtered || products.length === 0,
  });
}

type Props = PageProps<"/danh-muc/[slug]">;

// Khung trang dùng chung không phụ thuộc URL; phần đọc `params` nằm trong Suspense
// để điều hướng hiển thị ngay (Partial Prefetching của Next.js 16).
export default function CategoryPage({ params, searchParams }: Props) {
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pt-4 sm:pt-6">
      <Suspense fallback={<CategorySkeleton />}>
        <CategoryContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function CategorySkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="h-4 w-40 animate-pulse rounded bg-neutral-100" />
      <div className="flex items-center gap-3">
        <div className="size-12 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-6 w-48 animate-pulse rounded bg-neutral-100" />
      </div>
      <ProductGridSkeleton />
    </div>
  );
}

async function CategoryContent({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const [trail, children] = await Promise.all([
    getCategoryTrail(slug),
    getChildCategories(slug),
  ]);
  // Danh mục con: hiển thị các danh mục cùng cấp để chuyển nhanh.
  const siblings = category.parent ? await getChildCategories(category.parent) : [];
  const chips = children.length > 0 ? children : siblings;

  return (
    <>
      <JsonLd data={breadcrumbLd(trail.map((c) => ({ name: c.name, path: `/danh-muc/${c.slug}` })))} />
      <Breadcrumb
        items={trail.map((c, i) => ({
          label: c.name,
          href: i < trail.length - 1 ? `/danh-muc/${c.slug}` : undefined,
        }))}
      />

      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-700">
          <CategoryIcon icon={category.icon} className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-2xl">{category.name}</h1>
          <p className="text-sm text-neutral-500 [overflow-wrap:anywhere]">{category.description}</p>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {category.parent && (
            <Link
              href={`/danh-muc/${category.parent}`}
              className="shrink-0 rounded-xl bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
            >
              Tất cả
            </Link>
          )}
          {chips.map((c) => (
            <Link
              key={c.slug}
              href={`/danh-muc/${c.slug}`}
              aria-current={c.slug === slug ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${
                c.slug === slug
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              <CategoryIcon icon={c.icon} className="size-4" />
              {c.name}
            </Link>
          ))}
        </div>
      )}

      <Suspense fallback={<ProductGridSkeleton />}>
        <CategoryProducts slug={slug} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function CategoryProducts({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Promise<SearchParamsRecord>;
}) {
  const [products, query, category] = await Promise.all([getProductsByCategory(slug), searchParams, getCategoryBySlug(slug)]);
  // Tham số lọc/trang không hợp lệ (vd. thương hiệu lạ, trang vượt số trang) → không tìm thấy.
  const state = listingUrlState(query, products);
  if (!state.valid) notFound();
  // Nội dung chi tiết: dưới danh sách và phân trang, chỉ ở trang đầu không lọc/sắp xếp; trống thì không hiện.
  const body = !state.filtered && state.page === 1 ? (category?.body ?? "").trim() : "";
  const chrome = body ? await getSiteChrome() : null;
  return (
    <>
      <ProductListing
        products={products}
        params={parseListingParams(query)}
        basePath={`/danh-muc/${slug}`}
      />
      {body && chrome && (
        <section aria-label={`Giới thiệu ${category?.name ?? ""}`} className="border-t border-neutral-200 pt-8">
          <RichText source={body} vars={chrome.vars} hiddenPaths={chrome.hiddenPaths} />
        </section>
      )}
    </>
  );
}
