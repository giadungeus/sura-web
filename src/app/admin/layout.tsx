import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Quản trị", template: "%s | Quản trị Shop Online" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <div className="flex min-h-dvh flex-1 flex-col bg-neutral-50">{children}</div>;
}
