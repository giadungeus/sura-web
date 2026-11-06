import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Store } from "lucide-react";
import { DEFAULT_SETTINGS } from "@/lib/content/settings";
import { getAdminSession, hasAnyAdmin, safeAdminReturnPath } from "@/lib/server/admin-auth";
import { getSiteSettings } from "@/lib/server/site-content";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function AdminLoginPage({ searchParams }: PageProps<"/admin/dang-nhap">) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center gap-2 font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-lg bg-neutral-900 text-white">
            <Store className="size-5" aria-hidden />
          </span>
          <Suspense fallback={<span className="text-lg">{DEFAULT_SETTINGS.brandName}</span>}>
            <LoginBrand />
          </Suspense>
        </Link>
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold tracking-tight">Đăng nhập quản trị</h1>
          <p className="mt-1 text-sm text-neutral-500">Dành cho quản trị viên cửa hàng.</p>
          <Suspense fallback={<div className="mt-6 h-56 animate-pulse rounded-xl bg-neutral-100" />}>
            <LoginContent searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function LoginContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const next = safeAdminReturnPath(first(sp.tiep));

  // Đã đăng nhập thì vào thẳng trang quản trị.
  if (await getAdminSession()) redirect(next);

  const notice = first(sp["het-han"])
    ? "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại."
    : first(sp["da-dang-xuat"])
      ? "Bạn đã đăng xuất."
      : null;

  return <LoginForm next={next} notice={notice} noAdmin={!hasAnyAdmin()} />;
}

async function LoginBrand() {
  const { brandName } = await getSiteSettings();
  return <span className="text-lg">{brandName}</span>;
}
