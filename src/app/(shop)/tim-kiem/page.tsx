import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { SearchForm } from "@/components/layout/search-form";
import { ProductListing } from "@/components/listing/product-listing";
import { ProductGridSkeleton } from "@/components/product/product-card";
import { getRootCategories, searchProducts } from "@/lib/data/catalog";
import { parseListingParams, type SearchParamsRecord } from "@/lib/listing";

export const metadata: Metadata = {
  title: "Tìm kiếm",
};

const SUGGESTIONS = ["điện thoại", "laptop", "áo sơ mi", "nồi chiên", "son", "balo"];

export default function SearchPage({ searchParams }: PageProps<"/tim-kiem">) {
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 pt-4 sm:pt-6">
      <Suspense fallback={<ProductGridSkeleton />}>
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SearchResults({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const query = await searchParams;
  const raw = query.q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  if (!q) {
    const roots = await getRootCategories();
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Tìm kiếm</h1>
        <SearchForm className="md:hidden" autoFocus />
        <Suggestions />
        <div>
          <p className="mb-2 text-sm text-neutral-500">Hoặc duyệt theo ngành hàng</p>
          <div className="flex flex-wrap gap-2">
            {roots.map((c) => (
              <Link
                key={c.slug}
                href={`/danh-muc/${c.slug}`}
                className="rounded-full bg-neutral-100 px-3.5 py-1.5 text-sm hover:bg-neutral-200"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const results = await searchProducts(q);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
        Kết quả cho “{q}”
      </h1>
      {results.length > 0 ? (
        <ProductListing
          products={results}
          params={parseListingParams(query)}
          basePath="/tim-kiem"
          baseQuery={{ q }}
        />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 px-6 py-14 text-center">
          <SearchX className="size-10 text-neutral-300" aria-hidden />
          <p className="font-medium">Không tìm thấy sản phẩm nào</p>
          <p className="text-sm text-neutral-500">
            Hãy kiểm tra chính tả hoặc thử từ khóa khác.
          </p>
          <Suggestions />
        </div>
      )}
    </div>
  );
}

function Suggestions() {
  return (
    <div>
      <p className="mb-2 text-sm text-neutral-500">Gợi ý tìm kiếm</p>
      <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
        {SUGGESTIONS.map((s) => (
          <Link
            key={s}
            href={`/tim-kiem?q=${encodeURIComponent(s)}`}
            className="rounded-full border border-neutral-200 px-3.5 py-1.5 text-sm hover:border-neutral-400"
          >
            {s}
          </Link>
        ))}
      </div>
    </div>
  );
}
