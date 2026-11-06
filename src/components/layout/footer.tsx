import { Suspense } from "react";
import Link from "next/link";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { siteConfig } from "@/config/site";
import { getSiteChrome } from "@/lib/server/site-content";

/** Nội dung footer lấy từ Cài đặt website và các trang đang công khai (đọc lúc có yêu cầu). */
export function Footer() {
  return (
    <footer data-site-footer className="mt-16 border-t border-neutral-200 bg-neutral-50">
      <Suspense fallback={<div className="h-72" />}>
        <FooterContent />
      </Suspense>
    </footer>
  );
}

async function FooterContent() {
  const { settings: s, nav } = await getSiteChrome();
  return (
    <>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div className="space-y-3">
          <p className="text-base font-semibold">{s.brandName}</p>
          {s.footerDescription && <p className="text-neutral-500">{s.footerDescription}</p>}
          <ul className="space-y-2 text-neutral-600">
            {s.hotline && (
              <li>
                <ContactItem href={s.phoneHref} icon={Phone}>
                  Hotline: <span className="font-medium text-neutral-900">{s.hotline}</span>
                </ContactItem>
              </li>
            )}
            {s.zaloHref && (
              <li>
                <ContactItem href={s.zaloHref} icon={MessageCircle} external>
                  Zalo: {/^https?:/.test(s.zalo) ? "nhắn tin" : s.zalo}
                </ContactItem>
              </li>
            )}
            {s.email && (
              <li>
                <ContactItem href={s.emailHref} icon={Mail}>
                  <span className="break-all">{s.email}</span>
                </ContactItem>
              </li>
            )}
            {s.address && (
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-neutral-400" aria-hidden />
                {s.address}
              </li>
            )}
            {s.supportHours && (
              <li className="flex items-start gap-2">
                <Clock className="mt-0.5 size-4 shrink-0 text-neutral-400" aria-hidden />
                Hỗ trợ: {s.supportHours}
              </li>
            )}
          </ul>
        </div>
        {nav.groups.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <p className="mb-3 font-medium">{g.title}</p>
            <ul className="space-y-2 text-neutral-600">
              {g.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-neutral-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-neutral-200 px-4 py-4 text-center text-xs text-neutral-500">
        <p>
          © {s.brandName}
          {s.companyName && ` · ${s.companyName}`} · {siteConfig.shipping.label}
        </p>
      </div>
    </>
  );
}

function ContactItem({
  href,
  icon: Icon,
  external,
  children,
}: {
  href: string | null;
  icon: typeof Phone;
  external?: boolean;
  children: React.ReactNode;
}) {
  const inner = (
    <>
      <Icon className="size-4 shrink-0 text-neutral-400" aria-hidden />
      <span>{children}</span>
    </>
  );
  if (!href) return <span className="inline-flex items-center gap-2">{inner}</span>;
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex items-center gap-2 hover:text-neutral-900"
    >
      {inner}
    </a>
  );
}
