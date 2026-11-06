"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUp, Loader2, Package, Plus, Search, X } from "lucide-react";
import { Notice, inputClass } from "@/components/admin/form-ui";
import { formatVND } from "@/lib/format";
import type { HomePickItem } from "@/lib/server/home-picks";
import { saveHomePicksAction, searchHomeProductsAction, type HomeSearchItem } from "../../home-actions";

const STATE_LABEL: Record<HomePickItem["state"], { text: string; cls: string }> = {
  showing: { text: "Đang hiển thị", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  backup: { text: "Dự phòng", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  hidden: { text: "Không hiển thị", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
};

/** Danh sách chọn của một khu: tìm & thêm, lên/xuống, bỏ. Mỗi thay đổi lưu ngay (máy chủ kiểm tra lại). */
export function HomePicksEditor({
  section,
  label,
  show,
  max,
  note,
  initial,
}: {
  section: string;
  label: string;
  show: number;
  max: number;
  note: string;
  initial: HomePickItem[];
}) {
  const [items, setItems] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<HomeSearchItem[] | null>(null);
  const [pending, start] = useTransition();
  const ids = items.map((i) => i.id);

  const save = (next: string[], okText: string) =>
    start(async () => {
      const r = await saveHomePicksAction(section, next);
      setItems(r.items);
      setMessage(r.ok ? { ok: true, text: okText } : { ok: false, text: r.message });
    });
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    save(next, "Đã đổi thứ tự.");
  };
  const search = () =>
    start(async () => {
      setResults(await searchHomeProductsAction(q));
    });

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">
          {label} <span className="text-sm font-normal text-neutral-500">· hiện tối đa {show} · đã chọn {items.length}/{max}</span>
        </h2>
        <p className="text-sm text-neutral-500">{note}</p>
        {items.length === 0 && <p className="mt-1 text-sm text-amber-700">Chưa chọn sản phẩm nào — khu này đang ẩn trên trang chủ.</p>}
      </div>

      {message && <Notice tone={message.ok ? "success" : "error"}>{message.text}</Notice>}

      {items.length > 0 && (
        <ol className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-3 p-2.5">
              <span className="w-5 shrink-0 text-center text-xs text-neutral-400">{i + 1}</span>
              <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                {it.imageUrl ? (
                  <Image src={it.imageUrl} alt="" fill unoptimized sizes="44px" className="object-cover" />
                ) : (
                  <Package className="absolute inset-0 m-auto size-5 text-neutral-300" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                {it.slug ? (
                  <Link href={`/admin/san-pham/${it.id}`} className="line-clamp-1 text-sm font-medium hover:underline">
                    {it.name}
                  </Link>
                ) : (
                  <p className="line-clamp-1 text-sm font-medium text-neutral-500">{it.name}</p>
                )}
                <p className="text-xs text-neutral-500">
                  <span className={`mr-2 rounded-full px-1.5 py-0.5 ring-1 ring-inset ${STATE_LABEL[it.state].cls}`}>{STATE_LABEL[it.state].text}</span>
                  {it.price !== null && (
                    <>
                      {formatVND(it.price)}
                      {it.originalPrice !== null && <s className="ml-1 text-neutral-400">{formatVND(it.originalPrice)}</s>}
                    </>
                  )}
                  {it.reason && <span className="ml-1 text-amber-800">{it.reason}</span>}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" disabled={pending || i === 0} onClick={() => move(i, -1)} className="inline-flex size-8 items-center justify-center rounded-full border border-neutral-200 disabled:opacity-30" aria-label={`Đưa “${it.name}” lên`}>
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button type="button" disabled={pending || i === items.length - 1} onClick={() => move(i, 1)} className="inline-flex size-8 items-center justify-center rounded-full border border-neutral-200 disabled:opacity-30" aria-label={`Đưa “${it.name}” xuống`}>
                  <ArrowDown className="size-4" aria-hidden />
                </button>
                <button type="button" disabled={pending} onClick={() => save(ids.filter((x) => x !== it.id), "Đã bỏ khỏi danh sách.")} className="inline-flex size-8 items-center justify-center rounded-full border border-neutral-200 text-brand-700 disabled:opacity-30" aria-label={`Bỏ “${it.name}”`}>
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {items.length < max ? (
        <div className="space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                maxLength={60}
                placeholder="Tìm theo tên hoặc SKU để thêm"
                aria-label={`Tìm sản phẩm để thêm vào “${label}”`}
                className={inputClass(undefined, "pl-9")}
              />
            </div>
            <button type="submit" disabled={pending || !q.trim()} className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white disabled:opacity-40">
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />} Tìm
            </button>
          </form>
          {results && results.length === 0 && <p className="text-sm text-neutral-500">Không tìm thấy sản phẩm.</p>}
          {results && results.length > 0 && (
            <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
              {results.map((r) => {
                const added = ids.includes(r.id);
                return (
                  <li key={r.id} className="flex items-center gap-3 p-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1">{r.name}</span>
                      <span className="text-xs text-neutral-500">
                        {r.minPrice !== null ? formatVND(r.minPrice) : "—"} · {r.totalStock > 0 ? `tồn ${r.totalStock}` : "hết hàng"}
                        {!r.isVisible && " · đang Ẩn"}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={pending || added}
                      onClick={() => save([...ids, r.id], `Đã thêm “${r.name}”.`)}
                      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-neutral-300 px-3 text-xs font-medium disabled:opacity-40"
                    >
                      <Plus className="size-3.5" aria-hidden /> {added ? "Đã chọn" : "Thêm"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">Đã đủ {max} sản phẩm. Bỏ bớt để thêm sản phẩm khác.</p>
      )}
    </section>
  );
}
