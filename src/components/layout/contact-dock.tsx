"use client";

import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Bot, Headset, Mail, MessageCircle, Phone, X } from "lucide-react";

// Khung chat chỉ được tải khi khách bấm “Trợ lý Sura” (không tải sẵn, không gọi API khi mở).
const ChatPanel = lazy(() => import("@/components/chat/chat-panel"));
const GAP = 12;

/** Kênh liên hệ lấy từ Cài đặt website (truyền từ server). */
export type DockContact = { hotline: string; phoneHref: string | null; zaloHref: string | null; emailHref: string | null };

/**
 * Một nút hỗ trợ nổi duy nhất (mở ra Gọi / Zalo / Email).
 * - Tự nằm phía trên các thanh mua hàng cố định ở cuối màn hình (phần tử có `data-bottom-bar`),
 *   nên không che nút Thêm vào giỏ, Mua ngay hay tổng tiền.
 * - Tự ẩn khi footer hiện ra (footer đã có đủ thông tin liên hệ).
 * - Ghi chiều cao đo được của thanh cố định vào biến CSS `--bottom-bar-h`; globals.css dùng biến này
 *   làm khoảng đệm cuối trang để thanh không che footer.
 */
export function ContactDock({ contact, chatEnabled = false }: { contact: DockContact; chatEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const closeChat = useCallback(() => setChatOpen(false), []);
  const [offset, setOffset] = useState(0);
  const [hidden, setHidden] = useState(false);
  // Menu tự đóng khi nút bị ẩn (footer hiện ra).
  const menuOpen = open && !hidden;
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const vh = window.innerHeight;
      let barHeight = 0;
      for (const bar of document.querySelectorAll<HTMLElement>("[data-bottom-bar]")) {
        if (getComputedStyle(bar).position !== "fixed") continue; // máy tính: thanh không cố định
        const rect = bar.getBoundingClientRect();
        if (rect.height > 0) barHeight = Math.max(barHeight, vh - rect.top);
      }
      barHeight = Math.max(0, Math.round(barHeight));
      if (barHeight) document.documentElement.style.setProperty("--bottom-bar-h", `${barHeight + 8}px`);
      else document.documentElement.style.removeProperty("--bottom-bar-h");
      setOffset(barHeight);
      const footer = document.querySelector("[data-site-footer]");
      setHidden(!!footer && footer.getBoundingClientRect().top < vh - barHeight - 8);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
      document.documentElement.style.removeProperty("--bottom-bar-h");
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen]);

  const links = [
    { href: contact.phoneHref, icon: Phone, label: `Gọi ${contact.hotline}`, external: false },
    { href: contact.zaloHref, icon: MessageCircle, label: "Nhắn Zalo", external: true },
    { href: contact.emailHref, icon: Mail, label: "Gửi email", external: false },
  ].filter((l): l is { href: string; icon: typeof Phone; label: string; external: boolean } => !!l.href);
  // Chưa cài đặt kênh liên hệ nào thì không hiện nút (vẫn đo thanh cố định để chừa chỗ cho footer).
  if (links.length === 0 && !chatEnabled) return null;

  return (
    <>
      <div
        ref={rootRef}
        data-contact-dock
        className={`fixed right-3 z-30 flex flex-col items-end gap-2 transition-opacity sm:right-5 ${
          hidden ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        style={{ bottom: `calc(${offset + GAP}px + ${offset ? "0px" : "env(safe-area-inset-bottom)"})` }}
        aria-hidden={hidden || undefined}
      >
        {menuOpen && (
          <ul
            id="contact-dock-menu"
            className="w-52 overflow-hidden rounded-2xl border border-neutral-200 bg-white py-1 text-sm shadow-lg"
          >
            {links.map(({ href, icon: Icon, label, external }) => (
              <li key={href}>
                <a
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50"
                  onClick={() => setOpen(false)}
                >
                  <Icon className="size-4 text-neutral-500" aria-hidden />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        )}
        {chatEnabled && !chatOpen && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setChatOpen(true);
            }}
            tabIndex={hidden ? -1 : undefined}
            className="inline-flex size-11 items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white text-sm font-semibold text-neutral-900 shadow-lg hover:bg-neutral-50 sm:h-11 sm:w-auto sm:px-4"
          >
            <Bot className="size-5" aria-hidden />
            <span className="sr-only sm:not-sr-only">Trợ lý Sura</span>
          </button>
        )}
        {links.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="contact-dock-menu"
            tabIndex={hidden ? -1 : undefined}
            className="inline-flex size-11 items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white shadow-lg hover:bg-neutral-800 sm:h-11 sm:w-auto sm:px-4"
          >
            {menuOpen ? <X className="size-5" aria-hidden /> : <Headset className="size-5" aria-hidden />}
            <span className="sr-only sm:not-sr-only">{menuOpen ? "Đóng" : "Hỗ trợ"}</span>
          </button>
        )}
      </div>
      {chatOpen && (
        <Suspense fallback={null}>
          <ChatPanel onClose={closeChat} zaloHref={contact.zaloHref} />
        </Suspense>
      )}
    </>
  );
}
