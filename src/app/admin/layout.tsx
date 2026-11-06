import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/server/site-content";

export async function generateMetadata(): Promise<Metadata> {
  const { brandName } = await getSiteSettings();
  return {
    title: { default: "Quản trị", template: `%s | Quản trị ${brandName}` },
    robots: { index: false, follow: false },
  };
}

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return <div className="flex min-h-dvh flex-1 flex-col bg-neutral-50">{children}</div>;
}
