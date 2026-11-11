import Link from "next/link";
import { ProductImage } from "@/components/product/product-image";
import { Price } from "@/components/ui/price";
import { discountPercent } from "@/lib/format";
import type { Product } from "@/types";

export function ProductCard({ product }: { product: Product }) {
  const percent = discountPercent(product.price, product.originalPrice);
  return (
    <Link
      href={`/san-pham/${product.slug}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition hover:border-neutral-300 hover:shadow-sm"
    >
      <div className="relative">
        <ProductImage
          image={product.image}
          label={product.name}
          className="transition duration-300 group-hover:scale-[1.03]"
        />
        {percent > 0 && (
          <span className="absolute top-2 left-2 rounded-md bg-brand-600 px-1.5 py-0.5 text-xs font-semibold text-white">
            -{percent}%
          </span>
        )}
        {product.tags?.includes("moi") && (
          <span className="absolute top-2 right-2 rounded-md bg-neutral-900 px-1.5 py-0.5 text-xs font-medium text-white">
            Mới
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <p className="text-xs text-neutral-500">{product.brand}</p>
        <h3 className="line-clamp-2 min-h-10 text-sm leading-5 font-medium text-neutral-900 [overflow-wrap:anywhere]">
          {product.name}
        </h3>
        <div className="mt-auto pt-1">
          <Price price={product.price} originalPrice={product.originalPrice} />
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-neutral-200">
          <div className="aspect-square animate-pulse bg-neutral-100" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-100" />
            <div className="h-4 w-full animate-pulse rounded bg-neutral-100" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
