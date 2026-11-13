"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileArchive, Loader2, Smartphone, Monitor, Play, XCircle } from "lucide-react";
import { RichText } from "@/components/content/rich-text";
import type { PkgIssue } from "@/lib/server/package/manifest";
import type { CommitMode, CommitSummary, PackagePreview, PlanItem, PlanVideo } from "@/lib/server/package/service";
import { cancelPackageAction, commitPackageAction, getPackagePreviewAction, processPackageImagesAction } from "../../package-actions";

type Pending = { id: string; name: string; fileName: string; createdAt: string };
type Ready = Extract<PackagePreview, { ok: true }>;

const KIND = { san_pham: "Sản phẩm", tin_tuc: "Tin tức", trang: "Trang", danh_muc: "Danh mục" } as const;
const ACTION = {
  new: ["Tạo mới", "bg-emerald-50 text-emerald-800 ring-emerald-200"],
  update: ["Cập nhật", "bg-sky-50 text-sky-800 ring-sky-200"],
  unchanged: ["Giữ nguyên", "bg-neutral-100 text-neutral-600 ring-neutral-200"],
} as const;

export function PackageImportClient({ vars, hiddenPaths, pending }: { vars: Record<string, string>; hiddenPaths: string[]; pending: Pending[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; errors?: PkgIssue[]; warnings?: PkgIssue[] } | null>(null);
  const [warnings, setWarnings] = useState<PkgIssue[]>([]);
  const [progress, setProgress] = useState<{ done: number; failed: number; total: number } | null>(null);
  const [preview, setPreview] = useState<Ready | null>(null);
  const [mode, setMode] = useState<CommitMode>("draft");
  const [result, setResult] = useState<{ summary: CommitSummary; already: boolean } | null>(null);
  const stopped = useRef(false);
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  const loadPreview = async (batchId: string) => {
    const p = await getPackagePreviewAction(batchId);
    if (!p.ok) return setError({ message: p.message });
    setPreview(p);
    if (p.result) setResult({ summary: p.result, already: true });
  };

  /** Xử lý ảnh theo lượt ngắn rồi mở xem trước. */
  const runImages = async (batchId: string) => {
    setBusy("Đang tối ưu ảnh…");
    for (let idle = 0; !stopped.current; ) {
      let r: Awaited<ReturnType<typeof processPackageImagesAction>>;
      try {
        r = await processPackageImagesAction(batchId);
      } catch {
        r = { error: "Mất kết nối máy chủ. Ảnh đã xử lý vẫn được giữ; bấm “Tiếp tục” để làm tiếp." };
      }
      if ("error" in r) {
        setError({ message: r.error });
        break;
      }
      setProgress({ done: r.done, failed: r.failed, total: r.total });
      if (r.pending === 0) break;
      if (r.outcomes.length === 0) {
        if (++idle > 15) {
          setError({ message: "Ảnh đang được xử lý ở nơi khác. Hãy thử lại sau ít phút." });
          break;
        }
        await new Promise((ok) => setTimeout(ok, 4000));
      } else idle = 0;
    }
    setBusy("Đang chuẩn bị xem trước…");
    await loadPreview(batchId);
    setBusy(null);
  };

  const reset = () => {
    setError(null);
    setWarnings([]);
    setProgress(null);
    setPreview(null);
    setResult(null);
    setMode("draft");
  };

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    reset();
    if (file.size > 10 * 1024 * 1024) return setError({ message: "Gói vượt quá 10 MB." });
    setBusy("Đang tải lên và kiểm tra gói…");
    try {
      const res = await fetch("/admin/nhap-goi/tai-len", {
        method: "POST",
        headers: { "Content-Type": "application/zip", "X-File-Name": encodeURIComponent(file.name) },
        body: file,
      });
      const data = await res.json().catch(() => ({ ok: false, message: `Máy chủ trả về lỗi ${res.status}.` }));
      if (!data.ok) {
        setBusy(null);
        return setError(
          res.status === 413 ? { message: "Gói vượt quá giới hạn tải lên (10 MB hoặc giới hạn của máy chủ)." } : { message: data.message, errors: data.errors, warnings: data.warnings },
        );
      }
      setWarnings(data.warnings ?? []);
      await runImages(data.batchId);
    } catch {
      setBusy(null);
      setError({ message: "Không tải được gói lên. Kiểm tra kết nối rồi thử lại." });
    }
  };

  const commit = async () => {
    if (!preview) return;
    const label = mode === "publish" ? "CÔNG KHAI" : "LƯU NHÁP";
    if (!window.confirm(`Xác nhận ${label} ${preview.items.filter((i) => i.action !== "unchanged").length} mục từ gói này?`)) return;
    setBusy("Đang ghi…");
    try {
      const r = await commitPackageAction(preview.batchId, mode);
      if (r.ok) setResult({ summary: r.summary, already: r.alreadyApplied });
      else setError({ message: r.message, errors: r.errors });
    } catch {
      setError({ message: "Mất kết nối khi ghi. Có thể bấm xác nhận lại: nếu đã ghi, hệ thống chỉ báo lại kết quả, không ghi trùng." });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (batchId: string) => {
    if (!window.confirm("Bỏ lượt nhập này? Ảnh đã xử lý chưa dùng sẽ bị xoá; nội dung website không thay đổi.")) return;
    setBusy("Đang bỏ lượt nhập…");
    const r = await cancelPackageAction(batchId);
    setBusy(null);
    reset();
    setError(r.ok ? null : { message: r.message });
    if (fileRef.current) fileRef.current.value = "";
  };

  const changed = preview?.items.filter((i) => i.action !== "unchanged").length ?? 0;

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold">1. Chọn gói ZIP</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            aria-label="Gói nội dung ZIP"
            onChange={reset}
            className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
          <button
            type="button"
            onClick={upload}
            disabled={!!busy}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            <FileArchive className="size-4" aria-hidden /> Tải lên &amp; kiểm tra
          </button>
        </div>
        {pending.length > 0 && !preview && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Lượt nhập đang chờ xác nhận</p>
            <ul className="mt-1 space-y-1">
              {pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate">{p.name || p.fileName}</span>
                  <button type="button" onClick={() => runImages(p.id)} disabled={!!busy} className="font-medium underline underline-offset-4">
                    Tiếp tục
                  </button>
                  <button type="button" onClick={() => cancel(p.id)} disabled={!!busy} className="text-brand-700 underline underline-offset-4">
                    Bỏ
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {busy && (
          <p className="flex items-center gap-2 text-sm text-neutral-600" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {busy}
            {progress && ` ${progress.done + progress.failed}/${progress.total} ảnh`}
          </p>
        )}
      </section>

      {error && (
        <section role="alert" className="space-y-2 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-700">
          <p className="flex items-center gap-2 font-semibold">
            <XCircle className="size-4" aria-hidden /> {error.message}
          </p>
          {error.errors && <Issues list={error.errors} />}
          {error.warnings && error.warnings.length > 0 && <Issues list={error.warnings} tone="warn" />}
        </section>
      )}

      {preview && (
        <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">2. Xem trước: {preview.name || preview.fileName}</h2>
              <p className="text-xs text-neutral-500">
                {[preview.author && `Người soạn: ${preview.author}`, preview.date && `Ngày soạn: ${preview.date}`].filter(Boolean).join(" · ")}
                {" · "}
                {preview.items.length} mục, {changed} có thay đổi · ảnh {preview.progress.done}/{preview.progress.total}
              </p>
            </div>
            {preview.status === "staging" && !result && (
              <button type="button" onClick={() => cancel(preview.batchId)} disabled={!!busy} className="text-sm text-brand-700 underline underline-offset-4">
                Bỏ lượt nhập
              </button>
            )}
          </div>
          {warnings.length > 0 && <Issues list={warnings} tone="warn" />}
          {preview.imageNotes.length > 0 && (
            <ul className="space-y-0.5 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              {preview.imageNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {preview.errors.length > 0 && (
            <div role="alert" className="space-y-1 rounded-xl bg-brand-50 p-3 text-sm text-brand-700">
              <p className="font-semibold">Chưa thể nhập — sửa gói rồi tải lên lại:</p>
              <Issues list={preview.errors} />
            </div>
          )}
          <ul className="space-y-4">
            {preview.items.map((item) => (
              <PreviewItem key={item.index} item={item} vars={vars} hiddenPaths={hiddenPaths} />
            ))}
          </ul>

          {!result && preview.ready && (
            <div className="space-y-3 rounded-xl border border-neutral-200 p-4">
              <h3 className="font-semibold">3. Xác nhận</h3>
              <fieldset className="space-y-2 text-sm">
                <legend className="sr-only">Cách lưu</legend>
                <label className="flex items-start gap-2">
                  <input type="radio" name="mode" checked={mode === "draft"} onChange={() => setMode("draft")} className="mt-1 accent-neutral-900" />
                  <span>
                    <b>Lưu nháp</b> (mặc định) — khách vẫn thấy nội dung cũ; sản phẩm giữ nguyên Ẩn/Hiện. Xem lại và công khai sau trong
                    trình sửa.
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" name="mode" checked={mode === "publish"} onChange={() => setMode("publish")} className="mt-1 accent-neutral-900" />
                  <span>
                    <b>Công khai</b> — thay nội dung khách đang thấy; trang/tin tức được hiện. Sản phẩm đã có giữ nguyên danh mục và
                    Ẩn/Hiện.
                  </span>
                </label>
                <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                  Với cả hai cách, sản phẩm <b>mới</b> được tạo trong <b>“Danh mục chờ”</b> ở trạng thái <b>Ẩn</b>. Vào{" "}
                  <b>Sản phẩm → lọc “Danh mục chờ”</b> để chọn danh mục chính thức, bổ sung giá/tồn kho rồi Hiện.
                </p>
              </fieldset>
              <button
                type="button"
                onClick={commit}
                disabled={!!busy || changed === 0}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
              >
                {busy === "Đang ghi…" && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {mode === "publish" ? "Xác nhận & Công khai" : "Xác nhận & Lưu nháp"}
              </button>
              {changed === 0 && <p className="text-sm text-neutral-500">Gói không có gì mới so với website.</p>}
            </div>
          )}
        </section>
      )}

      {result && (
        <section role="status" className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-5" aria-hidden />
            {result.already ? "Gói này đã được nhập trước đó — không ghi lại." : `Đã ${result.summary.mode === "publish" ? "công khai" : "lưu nháp"}.`}
          </p>
          <ul className="space-y-1">
            {result.summary.items.map((i, n) => (
              <li key={n}>
                {KIND[i.kind]}: <b>{i.label}</b> — {ACTION[i.action][0]}
                {i.adminPath && (
                  <>
                    {" · "}
                    <Link href={i.adminPath} className="underline underline-offset-4">
                      Sửa trong quản trị
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PreviewItem({ item, vars, hiddenPaths }: { item: PlanItem; vars: Record<string, string>; hiddenPaths: string[] }) {
  const [mobile, setMobile] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [label, cls] = ACTION[item.action];
  const body = showCurrent && item.currentBody !== null ? item.currentBody : item.body;
  return (
    <li className="space-y-3 rounded-xl border border-neutral-200 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{label}</span>
        <span className="text-xs text-neutral-500">
          Mục {item.index} · {KIND[item.kind]}
        </span>
        <span className="font-medium">{item.label}</span>
      </div>
      {item.kind === "san_pham" && item.publicPath && (
        <p className="text-xs text-neutral-600">
          Sản phẩm đích: <span className="font-medium text-neutral-900">{item.label}</span> ·{" "}
          <a href={item.publicPath} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {item.publicPath}
          </a>
        </p>
      )}
      {item.create && (
        <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
          <p className="font-medium">
            Tạo sản phẩm mới trong “{item.create.category}” · trạng thái Ẩn · slug <code>{item.create.slug}</code>
            {item.create.brand && <> · thương hiệu {item.create.brand}</>}
          </p>
          <p className="text-xs">
            {item.create.variant
              ? `SKU ${item.create.variant.sku} · giá bán ${item.create.variant.price.toLocaleString("vi-VN")} ₫${
                  item.create.variant.compareAtPrice ? ` (niêm yết ${item.create.variant.compareAtPrice.toLocaleString("vi-VN")} ₫)` : ""
                } · tồn kho ${item.create.variant.stock}`
              : "Gói chưa có giá bán, tồn kho, SKU — sản phẩm được tạo chưa có phiên bản (không tự điền giá hay tồn kho)."}
          </p>
          <p className="text-xs font-medium text-amber-800">
            Quản trị cần bổ sung trước khi Hiện: {item.create.missing.join(", ")}.
          </p>
        </div>
      )}
      {item.changes.length > 0 && <p className="text-sm text-neutral-700">Thay đổi: {item.changes.join(", ")}.</p>}
      {item.notes.length > 0 && <p className="text-xs text-neutral-500">{item.notes.join(" ")}</p>}
      {item.seo && (
        <p className="text-xs text-neutral-600">
          SEO sau khi nhập — tiêu đề: {item.seo.seoTitle || "(mặc định)"}; mô tả: {item.seo.seoDescription || "(mặc định)"}
        </p>
      )}
      {item.errors.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm text-brand-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {item.errors.join(" ")}
        </p>
      )}
      {item.videos.length > 0 && <VideoPlanList videos={item.videos} existing={item.existingVideos} />}
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => setMobile((v) => !v)} className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-3 py-1">
          {mobile ? <Monitor className="size-3.5" aria-hidden /> : <Smartphone className="size-3.5" aria-hidden />}
          {mobile ? "Khổ máy tính" : "Khổ điện thoại"}
        </button>
        {item.currentBody !== null && item.action === "update" && (
          <button type="button" onClick={() => setShowCurrent((v) => !v)} className="rounded-full border border-neutral-300 px-3 py-1">
            {showCurrent ? "Xem bản trong gói" : "Xem bản hiện tại"}
          </button>
        )}
      </div>
      {/* Hiển thị bằng chính bộ hiển thị của website. */}
      <div className={`mx-auto overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-white p-4 ${mobile ? "max-w-[390px]" : ""}`}>
        {showCurrent && <p className="mb-2 text-xs font-medium text-amber-700">Bản hiện tại trên website / bản nháp đang có</p>}
        {item.title && <h3 className="text-xl font-bold tracking-tight">{item.title}</h3>}
        {item.summary && <p className="mt-2 text-neutral-600">{item.summary}</p>}
        {!showCurrent && item.cover && (
          <figure className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh đã tối ưu */}
            <img src={item.cover.url} alt={item.cover.alt} className="w-full rounded-xl" />
            <figcaption className="mt-1 text-xs text-neutral-500">
              Ảnh đại diện{item.cover.isNew ? " (mới)" : " (đã có)"} · alt: {item.cover.alt}
            </figcaption>
          </figure>
        )}
        {!showCurrent && item.gallery.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.gallery.map((g) => (
              // eslint-disable-next-line @next/next/no-img-element -- ảnh đã tối ưu
              <img key={g.url} src={g.url} alt={g.alt} title={`${g.alt}${g.isNew ? " (mới)" : ""}`} className="size-20 rounded-lg border border-neutral-200 object-cover" />
            ))}
          </div>
        )}
        <div className="mt-4">
          <RichText source={body} vars={vars} hiddenPaths={hiddenPaths} />
        </div>
      </div>
    </li>
  );
}

/**
 * Video sản phẩm trong gói: thứ tự, ảnh bìa (ảnh trong gói → ảnh khung hình YouTube → thẻ nút phát như trang sản phẩm),
 * và video nào sẽ thêm (vị trí trong hàng “Video sản phẩm”) hay bỏ qua vì đã có.
 */
function VideoPlanList({ videos, existing }: { videos: PlanVideo[]; existing: number }) {
  return (
    <div className="space-y-2 rounded-lg bg-neutral-50 p-3">
      <p className="text-sm font-medium">
        Video sản phẩm trong gói <span className="font-normal text-neutral-500">· sản phẩm đang có {existing} video, video mới nối vào sau</span>
      </p>
      <ol className="space-y-2">
        {videos.map((v, i) => (
          <li key={v.url} className="flex items-center gap-3 text-sm">
            <span className="w-5 shrink-0 text-right text-xs text-neutral-500">{i + 1}.</span>
            <span className="relative block aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-neutral-900">
              {v.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh bìa đã tối ưu / ảnh YouTube
                <img src={v.coverUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="absolute inset-x-0 bottom-1 text-center text-[10px] text-white/80">{v.platform === "youtube" ? "YouTube" : "TikTok"}</span>
              )}
              <span className="absolute inset-0 flex items-center justify-center">
                <Play className="size-5 fill-white text-white drop-shadow" aria-hidden />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 font-medium">{v.title}</span>
              <span className="block text-xs text-neutral-500">
                {v.platform === "youtube" ? "YouTube" : "TikTok"} · {v.orientation === "portrait" ? "Dọc" : "Ngang"} ·{" "}
                {v.coverFromPackage ? "ảnh bìa trong gói" : v.coverUrl ? "ảnh khung hình YouTube" : "chưa có ảnh bìa (thẻ nút phát)"}
              </span>
            </span>
            {v.action === "add" ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200 ring-inset">
                Thêm · vị trí {v.position}
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 ring-1 ring-neutral-200 ring-inset">
                Bỏ qua · đã có
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Issues({ list, tone = "error" }: { list: PkgIssue[]; tone?: "error" | "warn" }) {
  return (
    <ul className={`max-h-72 space-y-0.5 overflow-y-auto text-xs ${tone === "warn" ? "text-amber-900" : ""}`}>
      {list.map((i, n) => (
        <li key={n}>
          {i.item !== null && <b>Mục {i.item}: </b>}
          {i.message}
        </li>
      ))}
    </ul>
  );
}
