import Image from "next/image";
import { CategoryIcon } from "@/components/icons";
import type { ProductImage as ProductImageData, Tone } from "@/types";

/** Nền màu + biểu tượng ngành hàng khi sản phẩm chưa có ảnh thật. */
const TONES: Record<Tone, string> = {
  slate: "from-slate-100 to-slate-200 text-slate-500",
  sky: "from-sky-50 to-sky-100 text-sky-500",
  rose: "from-rose-50 to-rose-100 text-rose-400",
  amber: "from-amber-50 to-amber-100 text-amber-500",
  emerald: "from-emerald-50 to-emerald-100 text-emerald-500",
  violet: "from-violet-50 to-violet-100 text-violet-400",
  orange: "from-orange-50 to-orange-100 text-orange-400",
  teal: "from-teal-50 to-teal-100 text-teal-500",
};

export function ProductImage({
  image,
  label,
  className = "",
  iconClassName = "size-1/3",
  sizes = "(min-width: 1024px) 25vw, 50vw",
}: {
  image: ProductImageData;
  /** Văn bản thay thế cho trình đọc màn hình. */
  label: string;
  className?: string;
  iconClassName?: string;
  sizes?: string;
}) {
  if (image.url) {
    return (
      <div className={`relative aspect-square overflow-hidden bg-neutral-50 ${className}`}>
        <Image src={image.url} alt={label} fill unoptimized sizes={sizes} className="object-cover" />
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={label}
      className={`flex aspect-square items-center justify-center bg-linear-to-br ${TONES[image.tone] ?? TONES.slate} ${className}`}
    >
      <CategoryIcon icon={image.icon} className={iconClassName} strokeWidth={1.25} />
    </div>
  );
}
