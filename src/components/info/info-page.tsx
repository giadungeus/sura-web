import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { RichText } from "@/components/content/rich-text";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { applyVariables } from "@/lib/content/markup";
import { pageBySlug } from "@/lib/content/pages";
import type { PublicSettings } from "@/lib/content/settings";
import { getPublicContentPage, getSiteChrome } from "@/lib/server/site-content";
import { pageMetadata } from "@/lib/seo";
import { clipText, markupToPlainText, resolveSeo } from "@/lib/seo-text";

/** Tiêu đề trang nội dung (cho generateMetadata). */
export async function contentPageMetadata(slug: string): Promise<Metadata> {
  const page = await getPublicContentPage(slug);
  const def = pageBySlug(slug);
  if (!page || !def) return { title: "Không tìm thấy trang" };
  const { vars, settings } = await getSiteChrome();
  const name = applyVariables(page.title, vars);
  // Mô tả mặc định: đoạn văn đầu tiên của trang (đã bỏ mã định dạng).
  const firstParagraph = clipText(markupToPlainText(applyVariables(page.body, vars), true));
  const { title, description } = resolveSeo(page, { name, description: firstParagraph }, settings.brandName);
  return pageMetadata({ path: def.path, title, description, brand: settings.brandName });
}

/** Trang nội dung sửa trong Quản trị → Trang nội dung. Trang Nháp trả về “không tìm thấy”. */
export function ContentPage({ slug }: { slug: string }) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-6xl animate-pulse px-4 pt-6" aria-busy="true" />}>
      <ContentPageView slug={slug} />
    </Suspense>
  );
}

async function ContentPageView({ slug }: { slug: string }) {
  const def = pageBySlug(slug);
  const page = await getPublicContentPage(slug);
  if (!def || !page) notFound();
  const { settings, nav, vars, hiddenPaths } = await getSiteChrome();
  const title = applyVariables(page.title, vars);
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
      <Breadcrumb items={[...(def.group === "policies" ? [{ label: "Chính sách" }] : []), { label: title }]} />
      <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_240px] lg:gap-12">
        <article className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {slug === "lien-he" && <ContactCards s={settings} />}
          <div id={slug === "lien-he" ? "ho-tro" : undefined} className="mt-6 scroll-mt-32">
            <RichText source={page.body} vars={vars} hiddenPaths={hiddenPaths} />
          </div>
        </article>
        <aside aria-label="Trang thông tin khác" className="space-y-5 text-sm lg:pt-2">
          {nav.groups.map((g) => (
            <nav key={g.title} aria-label={g.title}>
              <p className="mb-2 font-medium">{g.title}</p>
              <ul className="space-y-1.5 text-neutral-600">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={l.href === def.path ? "page" : undefined}
                      className="hover:text-neutral-900 aria-[current=page]:font-medium aria-[current=page]:text-neutral-900"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </aside>
      </div>
    </div>
  );
}

/** Thẻ liên hệ trên trang Liên hệ — lấy trực tiếp từ Cài đặt website. */
function ContactCards({ s }: { s: PublicSettings }) {
  const cards = [
    s.phoneHref && { href: s.phoneHref, icon: Phone, title: "Gọi hotline", value: s.hotline },
    s.zaloHref && { href: s.zaloHref, icon: MessageCircle, title: "Nhắn Zalo", value: /^https?:/.test(s.zalo) ? "Mở Zalo" : s.zalo, external: true },
    s.emailHref && { href: s.emailHref, icon: Mail, title: "Gửi email", value: s.email },
  ].filter(Boolean) as { href: string; icon: typeof Phone; title: string; value: string; external?: boolean }[];
  return (
    <div className="mt-5 space-y-3">
      {s.companyName && <p className="text-neutral-600">{`${s.brandName} – ${s.companyName}.`}</p>}
      {cards.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-3">
          {cards.map(({ href, icon: Icon, title, value, external }) => (
            <li key={href}>
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="flex h-full flex-col gap-1 rounded-2xl border border-neutral-200 p-4 hover:border-neutral-300 hover:bg-neutral-50"
              >
                <Icon className="size-5 text-neutral-500" aria-hidden />
                <span className="font-semibold text-neutral-900">{title}</span>
                <span className="text-sm break-all text-neutral-600">{value}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {s.address && (
        <p className="flex items-start gap-2 text-neutral-700">
          <MapPin className="mt-1 size-4 shrink-0 text-neutral-400" aria-hidden />
          <span>
            Địa chỉ: <strong>{s.address}</strong>
          </span>
        </p>
      )}
      {s.supportHours && (
        <p className="flex items-start gap-2 text-neutral-700">
          <Clock className="mt-1 size-4 shrink-0 text-neutral-400" aria-hidden />
          <span>Giờ hỗ trợ: {s.supportHours}</span>
        </p>
      )}
    </div>
  );
}
