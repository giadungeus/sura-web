"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { CategoryIcon } from "@/components/icons";
import type { Category } from "@/types";

export type MenuGroup = { root: Category; children: Category[] };

export type MenuLink = { href: string; label: string };

export function MobileMenu({ groups, links }: { groups: MenuGroup[]; links: MenuLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-10 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 lg:hidden"
        aria-label="Mở danh mục"
        aria-expanded={open}
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {/* Portal ra body: header dùng backdrop-blur nên `fixed` bên trong sẽ bị giới hạn theo header. */}
      {open && createPortal(<MenuDrawer groups={groups} links={links} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function MenuDrawer({ groups, links, onClose }: { groups: MenuGroup[]; links: MenuLink[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Danh mục">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-white shadow-xl">
        <div className="flex h-14 items-center justify-between border-b border-neutral-200 px-4">
          <span className="font-semibold">Danh mục</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 items-center justify-center rounded-full hover:bg-neutral-100"
            aria-label="Đóng"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {groups.map(({ root, children }) => (
            <div key={root.slug} className="py-1">
              <Link
                href={`/danh-muc/${root.slug}`}
                onClick={onClose}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium hover:bg-neutral-50"
              >
                <CategoryIcon icon={root.icon} className="size-5 text-neutral-500" />
                {root.name}
              </Link>
              <div className="ml-11 flex flex-col">
                {children.map((child) => (
                  <Link
                    key={child.slug}
                    href={`/danh-muc/${child.slug}`}
                    onClick={onClose}
                    className="rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
                  >
                    {child.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <div className="mt-2 border-t border-neutral-200 pt-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={onClose}
                className="block rounded-lg px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
