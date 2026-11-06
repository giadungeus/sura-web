import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function Section({
  id,
  title,
  href,
  linkLabel = "Xem tất cả",
  children,
}: {
  id?: string;
  title: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-32 px-4 pt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
        {href && (
          <Link
            href={href}
            className="flex shrink-0 items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
          >
            {linkLabel}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
