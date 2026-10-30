import Form from "next/form";
import { Search } from "lucide-react";

export function SearchForm({
  defaultValue,
  autoFocus = false,
  className = "",
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <Form action="/tim-kiem" role="search" className={`relative ${className}`}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-neutral-400"
        aria-hidden
      />
      <input
        aria-label="Tìm kiếm sản phẩm"
        name="q"
        type="search"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        placeholder="Tìm sản phẩm, thương hiệu…"
        autoComplete="off"
        enterKeyHint="search"
        className="h-10 w-full rounded-full border border-neutral-200 bg-neutral-50 pr-4 pl-10 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white"
      />
    </Form>
  );
}
