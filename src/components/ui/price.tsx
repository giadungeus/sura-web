import { discountPercent, formatVND } from "@/lib/format";

const SIZES = {
  sm: { price: "text-base", original: "text-xs" },
  lg: { price: "text-2xl sm:text-3xl", original: "text-sm" },
} as const;

export function Price({
  price,
  originalPrice,
  size = "sm",
  showBadge = false,
}: {
  price: number;
  originalPrice?: number;
  size?: keyof typeof SIZES;
  showBadge?: boolean;
}) {
  const percent = discountPercent(price, originalPrice);
  const s = SIZES[size];
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={`font-semibold text-brand-600 ${s.price}`}>{formatVND(price)}</span>
      {percent > 0 && (
        <>
          <span className={`text-neutral-400 line-through ${s.original}`}>
            {formatVND(originalPrice!)}
          </span>
          {showBadge && (
            <span className="rounded bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-600">
              -{percent}%
            </span>
          )}
        </>
      )}
    </div>
  );
}
