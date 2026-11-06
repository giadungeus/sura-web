"use client";

import { useRef } from "react";
import { Loader2 } from "lucide-react";

export type ButtonDef = { intent: string; label: string; tone?: "primary" | "secondary" | "danger"; confirm?: string };

/**
 * Các nút gửi form kèm “ý định” (Lưu nháp / Công khai / …). Ghi ý định vào ô ẩn ngay khi bấm,
 * trước khi form được gửi.
 */
export function IntentButtons({ buttons, pending }: { buttons: ButtonDef[]; pending: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const style = {
    primary: "bg-neutral-900 text-white hover:bg-neutral-800",
    secondary: "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
    danger: "border border-brand-200 bg-white text-brand-700 hover:bg-brand-50",
  } as const;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={ref} type="hidden" name="intent" defaultValue="draft" />
      {buttons.map((b) => (
        <button
          key={b.intent}
          type="submit"
          disabled={pending}
          onClick={(e) => {
            if (b.confirm && !window.confirm(b.confirm)) {
              e.preventDefault();
              return;
            }
            if (ref.current) ref.current.value = b.intent;
          }}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-50 ${style[b.tone ?? "secondary"]}`}
        >
          {pending && b.tone === "primary" && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {b.label}
        </button>
      ))}
    </div>
  );
}
