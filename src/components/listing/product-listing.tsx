import Link from "next/link";
import { ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";
import { ProductGrid } from "@/components/product/product-card";
import {
  PRICE_RANGES,
  SORT_OPTIONS,
  applyListing,
  buildListingHref,
  type ListingParams,
} from "@/lib/listing";
import type { Product } from "@/types";

type Props = {
  products: Product[];
  params: ListingParams;
  basePath: string;
  /** Tham số giữ nguyên khi đổi bộ lọc (vd. từ khóa tìm kiếm). */
  baseQuery?: Record<string, string | undefined>;
};

/** Danh sách sản phẩm có lọc giá, thương hiệu, sắp xếp và phân trang qua URL. */
export function ProductListing({ products, params, basePath, baseQuery = {} }: Props) {
  const result = applyListing(products, params);
  const href = (changes: Partial<ListingParams>) =>
    buildListingHref(basePath, baseQuery, params, changes);
  const hasFilters = Boolean(params.price || params.brand);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <ChipRow label="Sắp xếp">
          {SORT_OPTIONS.map((o) => (
            <Chip key={o.value} href={href({ sort: o.value })} active={params.sort === o.value}>
              {o.label}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="Khoảng giá">
          {PRICE_RANGES.map((r) => (
            <Chip
              key={r.value}
              href={href({ price: params.price === r.value ? undefined : r.value })}
              active={params.price === r.value}
            >
              {r.label}
            </Chip>
          ))}
        </ChipRow>
        {result.brands.length > 1 || params.brand ? (
          <ChipRow label="Thương hiệu">
            {result.brands.map((b) => (
              <Chip
                key={b}
                href={href({ brand: params.brand === b ? undefined : b })}
                active={params.brand === b}
              >
                {b}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-sm text-neutral-500">
        <p>{result.total} sản phẩm</p>
        {hasFilters && (
          <Link
            href={href({ price: undefined, brand: undefined })}
            scroll={false}
            className="font-medium text-neutral-900 underline underline-offset-4"
          >
            Xóa bộ lọc
          </Link>
        )}
      </div>

      {result.items.length > 0 ? (
        <ProductGrid products={result.items} />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 px-6 py-14 text-center">
          <PackageSearch className="size-10 text-neutral-300" aria-hidden />
          <p className="font-medium">Không có sản phẩm phù hợp</p>
          <p className="text-sm text-neutral-500">Hãy thử bỏ bớt bộ lọc hoặc chọn khoảng giá khác.</p>
        </div>
      )}

      {result.totalPages > 1 && (
        <nav aria-label="Phân trang" className="flex items-center justify-center gap-2 pt-4">
          <PageLink href={href({ page: result.page - 1 })} disabled={result.page <= 1} label="Trang trước">
            <ChevronLeft className="size-4" aria-hidden />
          </PageLink>
          <span className="px-3 text-sm text-neutral-600">
            Trang {result.page} / {result.totalPages}
          </span>
          <PageLink
            href={href({ page: result.page + 1 })}
            disabled={result.page >= result.totalPages}
            label="Trang sau"
          >
            <ChevronRight className="size-4" aria-hidden />
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden w-24 shrink-0 text-sm text-neutral-500 sm:block">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {children}
      </div>
    </div>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap transition ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-200 text-neutral-700 hover:border-neutral-400"
      }`}
    >
      {children}
    </Link>
  );
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const cls = "inline-flex size-10 items-center justify-center rounded-full border border-neutral-200";
  if (disabled) {
    return (
      <span className={`${cls} text-neutral-300`} aria-disabled="true" aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`${cls} hover:border-neutral-400`} aria-label={label}>
      {children}
    </Link>
  );
}
