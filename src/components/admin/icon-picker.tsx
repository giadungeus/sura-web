"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CategoryIcon, ICON_GROUPS, ICON_OPTIONS, iconLabel } from "@/components/icons";
import { normalizeVietnamese } from "@/lib/search";
import type { IconKey } from "@/types";

/**
 * Chọn biểu tượng danh mục: chia nhóm, tên tiếng Việt, tìm kiếm không phân biệt dấu
 * (“loa”, “thu cung”, “sach”…). Nút 44px để chạm dễ trên điện thoại. Gửi mã qua ô ẩn `name`.
 */
export function IconPicker({ name, value, onChange, error }: { name: string; value: IconKey; onChange: (v: IconKey) => void; error?: string }) {
  const [q, setQ] = useState("");
  const term = normalizeVietnamese(q);
  const matches = useMemo(
    () =>
      term
        ? ICON_OPTIONS.filter((o) => normalizeVietnamese(`${o.label} ${o.group} ${o.keywords} ${o.key.replace(/-/g, " ")}`).includes(term))
        : ICON_OPTIONS,
    [term],
  );
  const label = iconLabel(value);

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">Biểu tượng</legend>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-2 text-sm text-neutral-600">
        <span className="flex size-11 items-center justify-center rounded-xl border border-neutral-900 bg-neutral-900 text-white">
          <CategoryIcon icon={value} className="size-5" />
        </span>
        <span>
          Đang chọn: <b className="text-neutral-900">{label ?? value}</b>
        </span>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm biểu tượng: loa, sách, thú cưng…"
          aria-label="Tìm biểu tượng"
          className="h-11 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-9 text-base outline-none focus:border-neutral-900 sm:text-sm"
        />
      </div>
      <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-neutral-200 p-2">
        {matches.length === 0 && <p className="p-2 text-sm text-neutral-500">Không có biểu tượng phù hợp.</p>}
        {ICON_GROUPS.map((g) => {
          const items = matches.filter((o) => o.group === g);
          if (items.length === 0) return null;
          return (
            <div key={g}>
              <p className="px-1 pb-1 text-xs font-medium text-neutral-500">{g}</p>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {items.map((o) => {
                  const active = o.key === value;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => onChange(o.key)}
                      aria-pressed={active}
                      title={o.label}
                      className={`flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-1.5 text-center text-[11px] leading-tight ${
                        active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-700 hover:border-neutral-400"
                      }`}
                    >
                      <CategoryIcon icon={o.key} className="size-5" />
                      <span className="line-clamp-2">{o.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="text-sm text-brand-700">{error}</p>}
    </fieldset>
  );
}
