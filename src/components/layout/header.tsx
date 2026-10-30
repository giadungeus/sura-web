import Link from "next/link";
import { Store } from "lucide-react";
import { siteConfig } from "@/config/site";
import { getCategories } from "@/lib/data/catalog";
import { CartButton } from "./cart-button";
import { MobileMenu, type MenuGroup } from "./mobile-menu";
import { SearchForm } from "./search-form";

export async function Header() {
  const all = await getCategories();
  const groups: MenuGroup[] = all
    .filter((c) => !c.parent)
    .map((root) => ({ root, children: all.filter((c) => c.parent === root.slug) }));

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex h-14 items-center gap-2 lg:h-16 lg:gap-6">
          <MobileMenu groups={groups} />
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <Store className="size-4.5" aria-hidden />
            </span>
            <span className="text-lg">{siteConfig.name}</span>
          </Link>
          <SearchForm className="mx-auto hidden w-full max-w-xl md:block" />
          <div className="ml-auto md:ml-0">
            <CartButton />
          </div>
        </div>
        <div className="pb-3 md:hidden">
          <SearchForm />
        </div>
        <nav aria-label="Ngành hàng" className="hidden lg:block">
          <ul className="-mx-3 flex gap-1 pb-2 text-sm">
            {groups.map(({ root }) => (
              <li key={root.slug}>
                <Link
                  href={`/danh-muc/${root.slug}`}
                  className="block rounded-full px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  {root.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
