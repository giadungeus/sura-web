"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Globe, Loader2, MessageCircle, Package, RotateCcw, Send, SquarePen, X } from "lucide-react";
import { CHAT_PUBLIC_LIMITS } from "@/lib/chat-limits";
import { formatVND } from "@/lib/format";
import { ChatMarkdown } from "./markdown";
import { SAFE_CARD_URL, cancel, getServerState, getState, reset, retry, send, sendQuick, submitCaptcha, subscribe, type BotMsg } from "./chat-store";

const QUICK = [
  { key: "giao-hang", label: "Giao hàng" },
  { key: "doi-tra", label: "Đổi trả" },
  { key: "bao-hanh", label: "Bảo hành" },
  { key: "thanh-toan", label: "Thanh toán" },
] as const;
const MAX = CHAT_PUBLIC_LIMITS.messageMax;

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => string; remove: (id: string) => void };
  }
}

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile"));
    document.head.appendChild(s);
  });
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Trạng thái chờ theo thời gian (máy chủ chưa gửi tiến độ từng bước). */
function PendingStatus({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  const label = s < 4 ? "Đang trả lời…" : s < 12 ? "Đang tra cứu dữ liệu…" : "Đang tra cứu thêm (có thể tìm trên web), có thể mất tới khoảng 45 giây…";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-500">
      <span className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" aria-hidden /> {label} {s >= 4 && <span className="tabular-nums">{s}s</span>}
      </span>
      <button type="button" onClick={cancel} className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs font-medium text-neutral-700 hover:border-neutral-900">
        Huỷ
      </button>
    </div>
  );
}

function BotBubble({ m, zaloHref, onClose }: { m: BotMsg; zaloHref: string | null; onClose: () => void }) {
  return (
    <div className="max-w-[94%] space-y-2">
      <div className={`rounded-2xl px-3 py-2 text-sm ${m.error ? "bg-amber-50 text-amber-900" : "bg-neutral-100"}`}>
        <ChatMarkdown text={m.text} />
      </div>
      {m.products && m.products.length > 0 && (
        <ul className="space-y-2">
          {m.products
            .filter((p) => SAFE_CARD_URL.test(p.url))
            .map((p) => (
              <li key={p.slug}>
                <Link href={p.url} onClick={onClose} className="flex gap-3 rounded-xl border border-neutral-200 p-2 hover:border-neutral-400">
                  <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- ảnh sản phẩm đã tối ưu, phục vụ qua /anh
                      <img src={p.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <Package className="size-6 text-neutral-300" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="line-clamp-2 font-medium">{p.name}</span>
                    <span className="block">
                      <b>{p.variants > 1 && p.minPrice !== p.maxPrice ? `Từ ${formatVND(p.price)}` : formatVND(p.price)}</b>
                      {p.compareAt && <s className="ml-1.5 text-xs text-neutral-400">{formatVND(p.compareAt)}</s>}
                    </span>
                    <span className={`text-xs ${p.inStock ? "text-emerald-700" : "text-brand-700"}`}>{p.inStock ? "Còn hàng" : "Hết hàng"} · dữ liệu Sura</span>
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      )}
      {m.sources && m.sources.length > 0 && (
        <div className="rounded-xl border border-neutral-200 px-3 py-2 text-xs">
          <p className="mb-1 flex items-center gap-1.5 font-medium text-neutral-700">
            <Globe className="size-3.5" aria-hidden /> Nguồn tham khảo trên web
          </p>
          <ol className="list-decimal space-y-1 pl-4">
            {m.sources.map((s) => (
              <li key={s.url} className="break-words">
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="text-sky-700 underline underline-offset-2">
                  {s.title || host(s.url)}
                </a>{" "}
                <span className="text-neutral-400">({host(s.url)})</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {((m.link && SAFE_CARD_URL.test(m.link.url)) || (m.showZalo && zaloHref)) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {m.link && SAFE_CARD_URL.test(m.link.url) && (
            <Link href={m.link.url} onClick={onClose} className="text-sm font-medium underline underline-offset-4">
              {m.link.label}
            </Link>
          )}
          {m.showZalo && zaloHref && (
            <a href={zaloHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white">
              <MessageCircle className="size-3.5" aria-hidden /> Nhắn Zalo
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Khung chat “Trợ lý Sura”. Chỉ tải khi khách bấm nút; mở khung KHÔNG gọi API. Lịch sử nằm trong chat-store. */
export default function ChatPanel({ onClose, zaloHref }: { onClose: () => void; zaloHref: string | null }) {
  const { msgs, pending, captcha } = useSyncExternalStore(subscribe, getState, getServerState);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const captchaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    if (window.matchMedia("(max-width: 639px)").matches) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, pending]);

  // CAPTCHA (Cloudflare Turnstile) chỉ hiện khi máy chủ yêu cầu.
  useEffect(() => {
    if (!captcha || !captchaRef.current) return;
    let id: string | null = null;
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !captchaRef.current || !window.turnstile) return;
        id = window.turnstile.render(captchaRef.current, { sitekey: captcha.siteKey, callback: (token) => submitCaptcha(token) });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [captcha]);

  const submit = () => {
    const text = input.trim();
    if (!text || pending) return;
    setInput("");
    send(text.slice(0, MAX));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Trợ lý Sura"
      className="fixed inset-0 z-50 flex flex-col bg-white sm:inset-auto sm:right-5 sm:bottom-5 sm:h-[min(640px,calc(100vh-2.5rem))] sm:w-[400px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-neutral-200 sm:shadow-2xl"
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="font-semibold">Trợ lý Sura</p>
          <p className="text-xs text-neutral-500">Trả lời tự động, có thể chưa chính xác</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {msgs.length > 0 && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
              title="Xoá lịch sử trên trình duyệt này và bắt đầu lại"
            >
              <SquarePen className="size-4" aria-hidden /> Cuộc trò chuyện mới
            </button>
          )}
          <button type="button" onClick={onClose} className="inline-flex size-10 items-center justify-center rounded-full hover:bg-neutral-100" aria-label="Đóng Trợ lý Sura">
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-4 py-3" aria-live="polite">
        <div className="rounded-2xl bg-neutral-100 px-3 py-2 text-sm">
          Chào bạn, mình là Trợ lý Sura! Bạn có thể hỏi mình mọi điều — giải thích, tính toán, so sánh — hoặc nhờ mình chọn sản phẩm đang bán trên Sura.
        </div>
        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q.key}
                type="button"
                disabled={!!pending}
                onClick={() => sendQuick(q.key, `Chính sách ${q.label.toLowerCase()}`)}
                className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:border-neutral-900 disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto flex max-w-[85%] flex-col items-end gap-1">
              <div className="rounded-2xl bg-neutral-900 px-3 py-2 text-sm break-words whitespace-pre-line text-white">{m.text}</div>
              {m.state && (
                <button
                  type="button"
                  disabled={!!pending}
                  onClick={() => retry(m.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs font-medium text-neutral-700 hover:border-neutral-900 disabled:opacity-40"
                >
                  <RotateCcw className="size-3.5" aria-hidden /> Thử lại
                </button>
              )}
            </div>
          ) : (
            <BotBubble key={m.id} m={m} zaloHref={zaloHref} onClose={onClose} />
          ),
        )}
        {pending && <PendingStatus startedAt={pending.startedAt} />}
        {captcha && (
          <div className="space-y-2 rounded-xl border border-neutral-200 p-3 text-sm">
            <p>Bạn hỏi hơi dồn dập — vui lòng xác nhận bạn không phải máy để tiếp tục.</p>
            <div ref={captchaRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="border-t border-neutral-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            maxLength={MAX}
            placeholder="Hỏi Trợ lý Sura…"
            aria-label="Câu hỏi"
            className="max-h-28 min-h-11 flex-1 resize-none rounded-xl border border-neutral-300 px-3 py-2.5 text-base outline-none focus:border-neutral-900 sm:text-sm"
          />
          <button type="submit" disabled={!!pending || !input.trim()} className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white disabled:opacity-40" aria-label="Gửi">
            {pending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Send className="size-5" aria-hidden />}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-neutral-500">
          Giá và tình trạng hàng trong thẻ sản phẩm lấy trực tiếp từ hệ thống. Lịch sử lưu trên trình duyệt này; không nhập thông tin cá nhân. {input.length}/{MAX}
        </p>
      </form>
    </div>
  );
}
