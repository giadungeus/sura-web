import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, LogOut, Store, UserRound } from "lucide-react";
import { getAdminSession } from "@/lib/server/admin-auth";
import { logoutAction } from "../actions";

/**
 * Khung các trang quản trị cần đăng nhập. Layout KHÔNG phải ranh giới bảo mật:
 * mỗi trang và mỗi Server Action đều tự kiểm tra phiên (requireAdmin / getAdminSession).
 */
export default function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <Store className="size-4" aria-hidden />
            </span>
            <span className="hidden sm:inline">Shop Online</span>
            <span className="hidden rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 sm:inline">
              Quản trị
            </span>
          </Link>
          <nav aria-label="Quản trị" className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm sm:ml-2">
            {[
              { href: "/admin", label: "Đơn hàng" },
              { href: "/admin/san-pham", label: "Sản phẩm" },
              { href: "/admin/danh-muc", label: "Danh mục" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-full px-2.5 py-1.5 font-medium whitespace-nowrap text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 sm:px-3"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/"
              target="_blank"
              rel="noopener"
              className="hidden items-center gap-1 rounded-full px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 sm:inline-flex"
            >
              Xem cửa hàng <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Suspense fallback={null}>
              <AdminName />
            </Suspense>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-200 px-3 text-sm text-neutral-700 hover:bg-neutral-100"
              >
                <LogOut className="size-4" aria-hidden />
                <span className="hidden sm:inline">Đăng xuất</span>
                <span className="sr-only sm:hidden">Đăng xuất</span>
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:py-8">{children}</main>
    </>
  );
}

async function AdminName() {
  const session = await getAdminSession();
  if (!session) return null;
  return (
    <span className="hidden items-center gap-1.5 text-sm text-neutral-600 md:inline-flex">
      <UserRound className="size-4" aria-hidden />
      {session.username}
    </span>
  );
}
