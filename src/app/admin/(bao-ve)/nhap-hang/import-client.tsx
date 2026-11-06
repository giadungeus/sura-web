"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileUp, ImageDown, Loader2, XCircle } from "lucide-react";
import { formatVND } from "@/lib/format";
import type { CommitResult, ImageOutcome, ImageProgress, PreviewResult } from "@/lib/server/import/service";
import { commitImportAction, previewImportAction, processImportImagesAction } from "../../import-actions";

export type PendingBatch = { id: string; fileName: string; completedAt: string | null; pending: number };

type ImageRun = {
  batchId: string;
  label: string;
  progress: ImageProgress | null;
  failures: ImageOutcome[];
  running: boolean;
  error?: string;
};

const ACTION_LABEL = { new: "Thêm mới", update: "Cập nhật", unchanged: "Giữ nguyên" } as const;
const ACTION_STYLE = {
  new: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  update: "bg-sky-50 text-sky-800 ring-sky-200",
  unchanged: "bg-neutral-100 text-neutral-600 ring-neutral-200",
} as const;

export function ImportClient({ pendingBatches }: { pendingBatches: PendingBatch[] }) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [imageRun, setImageRun] = useState<ImageRun | null>(null);
  const stopped = useRef(false);
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  /**
   * Gọi lặp các lượt ảnh ngắn tới khi hết ảnh chờ. Mỗi lượt là một yêu cầu riêng (~15 giây),
   * nên không vượt giới hạn thời gian của hosting; đóng trang giữa chừng thì bấm “Tiếp tục” sau.
   */
  const runImages = async (batchId: string, label: string) => {
    setImageRun({ batchId, label, progress: null, failures: [], running: true });
    let idleRounds = 0;
    while (!stopped.current) {
      let round: Awaited<ReturnType<typeof processImportImagesAction>>;
      try {
        round = await processImportImagesAction(batchId);
      } catch {
        round = { error: "Mất kết nối máy chủ. Ảnh đã tải vẫn được giữ; bấm “Tiếp tục tải ảnh” để làm tiếp." };
      }
      if ("error" in round) {
        const message = round.error;
        setImageRun((r) => r && { ...r, running: false, error: message });
        return;
      }
      const { outcomes, ...progress } = round;
      setImageRun((r) => r && { ...r, progress, failures: [...r.failures, ...outcomes.filter((o) => !o.ok)] });
      if (progress.pending === 0) break;
      // Còn ảnh chờ nhưng lượt này không xử lý được ảnh nào: ảnh đang được lượt khác (tab khác,
      // lượt bị ngắt) giữ chỗ — chờ rồi thử lại; giữ chỗ tự hết hạn sau 60 giây.
      if (outcomes.length === 0) {
        if (++idleRounds > 15) {
          setImageRun((r) => r && { ...r, running: false, error: "Ảnh đang được xử lý ở nơi khác. Hãy thử lại sau ít phút." });
          return;
        }
        await new Promise((ok) => setTimeout(ok, 5000));
      } else idleRounds = 0;
    }
    setImageRun((r) => r && { ...r, running: false });
  };
  const [result, setResult] = useState<CommitResult | null>(null);
  const [downloadImages, setDownloadImages] = useState(true);
  const [pending, startTransition] = useTransition();
  const [committing, setCommitting] = useState(false);
  // Mặc định các mục mới được công khai; quản trị có thể chọn tạo ở trạng thái Ẩn.
  const [hideNew, setHideNew] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPreview = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("downloadImages", downloadImages ? "1" : "0");
    startTransition(async () => {
      try {
        setPreview(await previewImportAction(fd));
      } catch {
        setPreview({ ok: false, message: "Không kết nối được máy chủ." });
      }
    });
  };

  const onCommit = () => {
    if (!preview?.ok || !preview.batchId || committing) return;
    setCommitting(true);
    const batchId = preview.batchId;
    const fileName = preview.fileName;
    startTransition(async () => {
      let res: CommitResult;
      try {
        res = await commitImportAction(batchId, hideNew);
      } catch {
        res = {
          ok: false,
          message: "Không kết nối được máy chủ. Có thể bấm xác nhận lại: nếu lần trước đã ghi xong, hệ thống chỉ báo lại kết quả, không ghi trùng.",
        };
      } finally {
        setCommitting(false);
      }
      setResult(res);
      if (res.ok && res.images.pending > 0) void runImages(batchId, fileName);
    });
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold">1. Chọn file CSV</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            aria-label="File CSV sản phẩm"
            onChange={() => {
              setPreview(null);
              setResult(null);
            }}
            className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-neutral-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
          />
          <button
            type="button"
            onClick={onPreview}
            disabled={pending}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending && !committing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileUp className="size-4" aria-hidden />}
            Xem trước
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={downloadImages} onChange={(e) => setDownloadImages(e.target.checked)} className="size-4 accent-neutral-900" />
          Tải ảnh từ cột “anh” khi nhập (tối đa 5 MB/ảnh, kiểm tra an toàn trước khi lưu)
        </label>
      </section>

      {preview && !preview.ok && (
        <section role="alert" className="space-y-2 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-700">
          <p className="font-semibold">{preview.message}</p>
          {preview.errors && <IssueList issues={preview.errors} />}
        </section>
      )}

      {preview?.ok && (
        <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
          <h2 className="font-semibold">2. Xem trước: {preview.fileName}</h2>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Dòng dữ liệu" value={preview.stats.rows} />
            <Stat label={hideNew ? "Sản phẩm mới (Ẩn)" : "Sản phẩm mới (Hiện)"} value={preview.stats.productsNew} tone="emerald" />
            <Stat label="Sản phẩm cập nhật" value={preview.stats.productsUpdate} tone="sky" />
            <Stat label="Sản phẩm giữ nguyên" value={preview.stats.productsUnchanged} />
            <Stat label="Phiên bản mới" value={preview.stats.variantsNew} tone="emerald" />
            <Stat label="Phiên bản cập nhật" value={preview.stats.variantsUpdate} tone="sky" />
            <Stat label={hideNew ? "Danh mục mới (Ẩn)" : "Danh mục mới (Hiện)"} value={preview.stats.categoriesNew} />
            <Stat label="Ảnh sẽ tải" value={preview.downloadImages ? preview.stats.imagesToDownload : 0} />
          </div>

          {preview.errors.length > 0 && (
            <div role="alert" className="space-y-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-700">
              <p className="flex items-center gap-2 font-semibold">
                <XCircle className="size-4" aria-hidden /> {preview.errors.length} lỗi — sửa file rồi xem trước lại. Chưa có gì được ghi.
              </p>
              <IssueList issues={preview.errors} />
            </div>
          )}
          {preview.warnings.length > 0 && (
            <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="size-4" aria-hidden /> {preview.warnings.length} cảnh báo (vẫn nhập được)
              </p>
              <IssueList issues={preview.warnings} />
            </div>
          )}
          {preview.newCategories.length > 0 && (
            <p className="text-sm text-neutral-600">
              Danh mục sẽ tạo ({hideNew ? "Ẩn" : "Hiện"}): <b>{preview.newCategories.join("; ")}</b>
            </p>
          )}

          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            {preview.products.map((p) => (
              <li key={`${p.source}|${p.code}`} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ACTION_STYLE[p.action]}`}>
                    {ACTION_LABEL[p.action]}
                  </span>
                  <span className="font-mono text-xs text-neutral-500">
                    dòng {p.line} · {p.source}/{p.code}
                  </span>
                  {p.name && <span className="font-medium">{p.name}</span>}
                </div>
                {(p.category || p.changes.length > 0 || p.images > 0) && (
                  <p className="text-xs text-neutral-500">
                    {p.category && `Danh mục: ${p.category}. `}
                    {p.changes.length > 0 && `Thay đổi: ${p.changes.join(", ")}. `}
                    {p.images > 0 && `${p.images} ảnh mới.`}
                  </p>
                )}
                <ul className="space-y-0.5 pl-3 text-xs text-neutral-600">
                  {p.variants.map((v) => (
                    <li key={v.sku}>
                      <span className="font-mono">{v.sku}</span>
                      {v.options && ` (${v.options})`} — {ACTION_LABEL[v.action as keyof typeof ACTION_LABEL]}
                      {v.action === "new" && v.price !== null && ` · ${formatVND(v.price)} · tồn ${v.stock ?? "?"}`}
                      {v.changes.length > 0 && ` · ${v.changes.join(", ")}`}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {!result?.ok && (preview.stats.productsNew > 0 || preview.stats.categoriesNew > 0) && (
            <div className="space-y-2 rounded-xl border border-neutral-200 p-3 text-sm">
              <p>
                {hideNew ? (
                  <>
                    Các sản phẩm/danh mục <b>mới</b> sẽ được tạo ở trạng thái <b>Ẩn</b>; bật “Hiện” sau trong trang Sản phẩm/Danh mục.
                  </>
                ) : (
                  <>
                    Các sản phẩm/danh mục <b>mới</b> sẽ được <b>công khai (Hiện)</b> trên cửa hàng ngay khi xác nhận.
                  </>
                )}{" "}
                Mục đã có giữ nguyên trạng thái Hiện/Ẩn hiện tại.
              </p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hideNew} onChange={(e) => setHideNew(e.target.checked)} className="size-4 accent-neutral-900" />
                Tạo các mục mới ở trạng thái Ẩn
              </label>
            </div>
          )}
          {!result?.ok && (
            <button
              type="button"
              onClick={onCommit}
              disabled={!preview.batchId || committing || pending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {committing && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {committing ? "Đang nhập…" : "3. Xác nhận nhập"}
            </button>
          )}
        </section>
      )}

      {result && !result.ok && (
        <section role="alert" className="space-y-2 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-700">
          <p className="font-semibold">{result.message}</p>
          {result.errors && <IssueList issues={result.errors} />}
        </section>
      )}

      {result?.ok && (
        <section role="status" className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="size-5" aria-hidden /> Đã nhập: {result.createdProductIds.length} sản phẩm mới (
            {result.newVisible === false ? "đang Ẩn" : "đang Hiện"}),{" "}
            {result.updatedProductIds.length} sản phẩm cập nhật.
          </p>
          {result.alreadyApplied && <p>Lượt nhập này đã được ghi từ trước — không ghi lại lần nữa.</p>}
          {result.images.total > 0 && !imageRun && (
            <p>
              Ảnh: {result.images.done}/{result.images.total} đã tải
              {result.images.failed > 0 && `, ${result.images.failed} lỗi`}.
            </p>
          )}
          <Link
            href={result.newVisible === false ? "/admin/san-pham?tt=an" : "/admin/san-pham"}
            className="inline-block font-medium underline underline-offset-4"
          >
            {result.newVisible === false ? "Xem các sản phẩm đang ẩn để kiểm tra và bật hiển thị →" : "Xem danh sách sản phẩm →"}
          </Link>
        </section>
      )}

      {imageRun && <ImageRunPanel run={imageRun} onResume={() => void runImages(imageRun.batchId, imageRun.label)} />}

      {!imageRun?.running && pendingBatches.some((b) => b.id !== imageRun?.batchId) && (
        <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Lượt nhập còn ảnh chưa tải (lần trước bị ngắt hoặc đã đóng trang)</p>
          <ul className="space-y-2">
            {pendingBatches
              .filter((b) => b.id !== imageRun?.batchId)
              .map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2">
                  <span>
                    {b.fileName} — còn {b.pending} ảnh
                  </span>
                  <button
                    type="button"
                    onClick={() => void runImages(b.id, b.fileName)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-900 px-3 text-xs font-semibold text-white hover:bg-neutral-800"
                  >
                    <ImageDown className="size-3.5" aria-hidden /> Tiếp tục tải ảnh
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ImageRunPanel({ run, onResume }: { run: ImageRun; onResume: () => void }) {
  const p = run.progress;
  const finished = p ? p.done + p.failed : 0;
  return (
    <section role="status" className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        {run.running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImageDown className="size-4" aria-hidden />}
        Ảnh của “{run.label}”:{" "}
        {p ? `${finished}/${p.total} đã xử lý (${p.done} thành công${p.failed ? `, ${p.failed} lỗi` : ""})` : "đang bắt đầu…"}
      </p>
      {run.running && <p className="text-xs text-neutral-500">Giữ trang này mở. Nếu đóng trang, ảnh đã tải vẫn giữ và có thể tiếp tục sau.</p>}
      {run.error && <p className="text-brand-700">{run.error}</p>}
      {!run.running && (run.error || (p && p.pending > 0)) && (
        <button
          type="button"
          onClick={onResume}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          <ImageDown className="size-4" aria-hidden /> Tiếp tục tải ảnh{p && p.pending > 0 ? ` (${p.pending} còn lại)` : ""}
        </button>
      )}
      {run.failures.length > 0 && (
        <ul className="max-h-60 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
          {run.failures.map((f, i) => (
            <li key={i} className="text-brand-700">
              {f.product}: {f.message} <span className="break-all text-neutral-500">({f.url})</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "sky" }) {
  const color = tone === "emerald" ? "text-emerald-700" : tone === "sky" ? "text-sky-700" : "text-neutral-900";
  return (
    <div className="rounded-xl bg-neutral-50 p-3">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function IssueList({ issues }: { issues: { line: number; column?: string; message: string }[] }) {
  return (
    <ul className="max-h-72 space-y-0.5 overflow-y-auto text-xs">
      {issues.map((issue, i) => (
        <li key={i}>
          <span className="font-mono font-semibold">Dòng {issue.line}</span>
          {issue.column && <span className="font-mono"> [{issue.column}]</span>}: {issue.message}
        </li>
      ))}
    </ul>
  );
}
