import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { MAX_CSV_BYTES, decodeUtf8, parseCsv } from "@/lib/import/csv";
import { getDb, withTransaction } from "@/lib/server/db";
import { discardStoredImage, ImageRejectedError, processImageBuffer, type ProcessedImage } from "@/lib/server/images";
import { applyImportPlan } from "@/lib/server/import/apply";
import { syncProductPublic } from "@/lib/server/public-state";
import { ImageFetchError, fetchImageFromUrl } from "@/lib/server/import/fetch-image";
import { buildImportPlan, checkHeaders, type ImportPlan, type ImportRow, type ImportStats, type RowIssue } from "@/lib/server/import/plan";

/** Thông tin xem trước gửi về trình duyệt (không chứa giá nhập). */
export type PreviewProduct = {
  line: number;
  source: string;
  code: string;
  name: string;
  action: "new" | "update" | "unchanged";
  category: string;
  variants: { sku: string; options: string; action: string; price: number | null; stock: number | null; changes: string[] }[];
  changes: string[];
  images: number;
};

export type PreviewResult =
  | { ok: false; message: string; errors?: RowIssue[] }
  | {
      ok: true;
      batchId: string | null;
      fileName: string;
      stats: ImportStats;
      errors: RowIssue[];
      warnings: RowIssue[];
      newCategories: string[];
      products: PreviewProduct[];
      downloadImages: boolean;
    };

const MAX_IMAGE_JOBS = 300;
const BATCH_TTL_MS = 24 * 60 * 60 * 1000;

function toPreview(plan: ImportPlan): PreviewProduct[] {
  return plan.products.slice(0, 300).map((p) => ({
    line: p.firstLine,
    source: p.source,
    code: p.code,
    name: p.name ?? "",
    action: p.action,
    category: p.categoryLabel ?? "",
    changes: p.changes,
    images: p.imageUrls.length,
    variants: p.variants.map((v) => ({
      sku: v.sku,
      options: Object.values(v.options).join(" · "),
      action: v.action,
      price: v.price ?? null,
      stock: v.stock ?? null,
      changes: v.changes,
    })),
  }));
}

/** Đọc file CSV, lập kế hoạch (không ghi sản phẩm) và lưu lượt nhập để xác nhận sau. */
export async function previewImport(file: File, adminUsername: string, downloadImages: boolean): Promise<PreviewResult> {
  if (file.size === 0) return { ok: false, message: "File rỗng." };
  if (file.size > MAX_CSV_BYTES) return { ok: false, message: "File vượt quá 2 MB. Hãy chia thành nhiều file nhỏ hơn." };
  if (!/\.csv$/i.test(file.name)) return { ok: false, message: "Chỉ nhận file .csv (lưu từ Excel bằng “CSV UTF-8”)." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = decodeUtf8(bytes);
  if (text === null) return { ok: false, message: "File không phải UTF-8. Trong Excel hãy chọn Lưu dưới dạng → “CSV UTF-8 (Comma delimited)”." };
  const parsed = parseCsv(text);
  if (!parsed.ok) return { ok: false, message: parsed.message };

  const headerCheck = checkHeaders(parsed.headers);
  if (headerCheck.errors.length) {
    return { ok: false, message: "File thiếu cột bắt buộc hoặc có cột trùng.", errors: headerCheck.errors };
  }

  const rows: ImportRow[] = parsed.rows.map((cells, index) => {
    const row: Record<string, string> = { __line: String(index + 2) };
    parsed.headers.forEach((h, i) => {
      if (h) row[h] = cells[i] ?? "";
    });
    return row as ImportRow;
  });

  const db = getDb();
  const plan = buildImportPlan(db, rows);
  plan.warnings.unshift(...headerCheck.warnings);
  plan.stats.warnings = plan.warnings.length;
  if (plan.stats.imagesToDownload > MAX_IMAGE_JOBS && downloadImages) {
    plan.errors.push({ line: 1, column: "anh", message: `Quá nhiều ảnh cần tải (${plan.stats.imagesToDownload}). Tối đa ${MAX_IMAGE_JOBS} ảnh mỗi lượt nhập.` });
    plan.stats.errors = plan.errors.length;
  }

  // Dọn lượt nhập cũ chưa xác nhận.
  db.prepare("DELETE FROM import_batches WHERE status = 'preview' AND created_at < ?").run(new Date(Date.now() - BATCH_TTL_MS).toISOString());

  let batchId: string | null = null;
  if (plan.errors.length === 0) {
    batchId = randomUUID();
    db.prepare(
      `INSERT INTO import_batches (id, admin_username, file_name, file_sha256, rows_json, download_images, status, summary_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'preview', ?, ?)`,
    ).run(
      batchId,
      adminUsername,
      file.name.slice(0, 200),
      createHash("sha256").update(bytes).digest("hex"),
      JSON.stringify(rows),
      downloadImages ? 1 : 0,
      JSON.stringify(plan.stats),
      new Date().toISOString(),
    );
  }

  return {
    ok: true,
    batchId,
    fileName: file.name,
    stats: plan.stats,
    errors: plan.errors.slice(0, 500),
    warnings: plan.warnings.slice(0, 500),
    newCategories: plan.categories.map((c) => c.label),
    products: toPreview(plan),
    downloadImages,
  };
}

// ═════════════════════ Xác nhận nhập (một giao dịch duy nhất) ═════════════════════

export type ImageProgress = { total: number; done: number; failed: number; pending: number };

export type CommitResult =
  | { ok: false; message: string; errors?: RowIssue[] }
  | {
      ok: true;
      /** true nếu lượt nhập đã được ghi từ trước (gửi lại/bấm lại): không ghi thêm gì. */
      alreadyApplied: boolean;
      stats: ImportStats;
      createdProductIds: string[];
      updatedProductIds: string[];
      /** Các sản phẩm/danh mục mới được tạo ở trạng thái Hiện (mặc định) hay Ẩn. */
      newVisible?: boolean;
      images: ImageProgress;
    };

type StoredResult = { stats: ImportStats; createdProductIds: string[]; updatedProductIds: string[]; newVisible?: boolean };

export function imageProgress(batchId: string): ImageProgress {
  const rows = getDb()
    .prepare("SELECT status, COUNT(*) AS n FROM import_image_jobs WHERE batch_id = ? GROUP BY status")
    .all(batchId) as { status: string; n: number }[];
  const count = (st: string) => rows.find((r) => r.status === st)?.n ?? 0;
  const done = count("done");
  const failed = count("failed");
  const pending = count("pending");
  return { total: done + failed + pending, done, failed, pending };
}

/**
 * Xác nhận nhập. TẤT CẢ trong MỘT giao dịch: kiểm tra trạng thái lượt nhập → lập lại kế hoạch
 * trên dữ liệu mới nhất → ghi danh mục/sản phẩm/biến thể → tạo hàng đợi ảnh → đánh dấu “đã nhập”.
 * - Bị ngắt giữa chừng (hosting dừng tiến trình, mất điện): SQLite huỷ toàn bộ giao dịch, không có
 *   dữ liệu dở dang; lượt nhập vẫn ở trạng thái xem trước và xác nhận lại được.
 * - Gửi lại sau khi đã ghi (mất phản hồi, bấm hai lần, hai tab): trả về kết quả cũ, không ghi lại.
 * Ảnh KHÔNG được tải ở đây (xem processImageJobs) để yêu cầu luôn ngắn.
 */
export function commitImport(batchId: string, opts: { newVisible?: boolean } = {}): CommitResult {
  const newVisible = opts.newVisible !== false;
  type Outcome =
    | { kind: "missing" | "expired" }
    | { kind: "already"; result: StoredResult }
    | { kind: "errors"; errors: RowIssue[] }
    | { kind: "ok"; result: StoredResult };

  let outcome: Outcome;
  try {
    outcome = withTransaction((tx): Outcome => {
      const batch = tx
        .prepare("SELECT status, rows_json, download_images, created_at, result_json FROM import_batches WHERE id = ?")
        .get(batchId) as
        | { status: string; rows_json: string; download_images: number; created_at: string; result_json: string | null }
        | undefined;
      if (!batch) return { kind: "missing" };
      if (batch.status !== "preview") {
        return batch.result_json ? { kind: "already", result: JSON.parse(batch.result_json) as StoredResult } : { kind: "expired" };
      }
      if (Date.parse(batch.created_at) < Date.now() - BATCH_TTL_MS) return { kind: "expired" };

      const plan = buildImportPlan(tx, JSON.parse(batch.rows_json) as ImportRow[]);
      if (plan.errors.length) return { kind: "errors", errors: plan.errors };

      const applied = applyImportPlan(tx, plan, { newVisible });
      if (batch.download_images) {
        const insertJob = tx.prepare(
          `INSERT INTO import_image_jobs (batch_id, product_id, product_label, url, status, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?) ON CONFLICT DO NOTHING`,
        );
        const now = new Date().toISOString();
        for (const job of applied.imageJobs) insertJob.run(batchId, job.productId, job.productLabel, job.url, now);
      }
      const result: StoredResult = {
        stats: plan.stats,
        createdProductIds: applied.createdProductIds,
        updatedProductIds: applied.updatedProductIds,
        newVisible,
      };
      tx.prepare("UPDATE import_batches SET status = 'applied', result_json = ?, completed_at = ? WHERE id = ?").run(
        JSON.stringify(result),
        new Date().toISOString(),
        batchId,
      );
      return { kind: "ok", result };
    });
  } catch (error) {
    console.error("[import] Lỗi ghi dữ liệu:", error instanceof Error ? error.message : error);
    return { ok: false, message: "Không ghi được dữ liệu do lỗi hệ thống; chưa có thay đổi nào được lưu. Có thể bấm xác nhận lại." };
  }

  switch (outcome.kind) {
    case "missing":
      return { ok: false, message: "Không tìm thấy lượt nhập. Hãy tải file lên và xem trước lại." };
    case "expired":
      return { ok: false, message: "Lượt xem trước đã quá 24 giờ. Hãy tải file lên và xem trước lại." };
    case "errors":
      return {
        ok: false,
        message: "Dữ liệu đã thay đổi kể từ lúc xem trước và phát sinh lỗi. Chưa ghi gì; hãy xem trước lại.",
        errors: outcome.errors,
      };
    default:
      return { ok: true, alreadyApplied: outcome.kind === "already", ...outcome.result, images: imageProgress(batchId) };
  }
}

// ═════════════════════ Hàng đợi tải ảnh (từng lượt ngắn) ═════════════════════

export type ImageOutcome = { product: string; url: string; ok: boolean; message?: string };
export type ImageRoundResult = ImageProgress & { outcomes: ImageOutcome[] };

/** Thời gian tối đa để BẮT ĐẦU ảnh mới trong một lượt (sau đó trình duyệt tự gọi lượt tiếp). */
const IMAGE_BUDGET_MS = Number(process.env.SHOP_IMPORT_IMAGE_BUDGET_MS) || 15_000;
/** Ảnh đang được một lượt giữ chỗ trong khoảng này; lượt bị ngắt thì hết hạn và ảnh được làm lại. */
const JOB_LEASE_MS = 60_000;
const MAX_ATTEMPTS = 3;

type ClaimedJob = { id: number; product_id: string; url: string; product_label: string; attempts: number };

function claimJob(batchId: string): ClaimedJob | null {
  const now = new Date();
  const row = getDb()
    .prepare(
      `UPDATE import_image_jobs
       SET locked_until = ?, attempts = attempts + 1, updated_at = ?
       WHERE id = (SELECT id FROM import_image_jobs
                   WHERE batch_id = ? AND status = 'pending' AND (locked_until IS NULL OR locked_until < ?)
                   ORDER BY id LIMIT 1)
       RETURNING id, product_id, url, product_label, attempts`,
    )
    .get(new Date(now.getTime() + JOB_LEASE_MS).toISOString(), now.toISOString(), batchId, now.toISOString()) as
    | ClaimedJob
    | undefined;
  return row ?? null;
}

function finishJob(id: number, status: "done" | "failed", message: string | null) {
  getDb()
    .prepare("UPDATE import_image_jobs SET status = ?, message = ?, locked_until = NULL, updated_at = ? WHERE id = ?")
    .run(status, message, new Date().toISOString(), id);
}

async function runJob(job: ClaimedJob): Promise<ImageOutcome> {
  const base = { product: job.product_label, url: job.url };
  const db = getDb();
  // Đã gắn từ lần trước (lượt trước bị ngắt sau khi lưu ảnh): không tải lại, không gắn trùng.
  if (db.prepare("SELECT 1 FROM product_images WHERE product_id = ? AND source_url = ?").get(job.product_id, job.url)) {
    finishJob(job.id, "done", null);
    return { ...base, ok: true };
  }
  if (job.attempts > MAX_ATTEMPTS) {
    finishJob(job.id, "failed", "Đã thử 3 lần không thành công.");
    return { ...base, ok: false, message: "Đã thử 3 lần không thành công." };
  }
  let processed: ProcessedImage | null = null;
  let attached = false;
  try {
    processed = await processImageBuffer(await fetchImageFromUrl(job.url));
    const saved = processed;
    attached = withTransaction((tx) => {
      const exists = tx.prepare("SELECT 1 FROM product_images WHERE product_id = ? AND source_url = ?").get(job.product_id, job.url);
      if (!exists) {
        const hasPrimary = tx.prepare("SELECT 1 FROM product_images WHERE product_id = ? AND is_primary = 1").get(job.product_id);
        const position = (
          tx.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM product_images WHERE product_id = ?").get(job.product_id) as {
            p: number;
          }
        ).p;
        const now = new Date().toISOString();
        tx.prepare(
          `INSERT INTO product_images (product_id, file_name, width, height, size_bytes, position, is_primary, uploaded_by, source_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'nhap-csv', ?, ?)`,
        ).run(job.product_id, saved.fileName, saved.width, saved.height, saved.sizeBytes, position, hasPrimary ? 0 : 1, job.url, now);
        tx.prepare("UPDATE products SET updated_at = ? WHERE id = ?").run(now, job.product_id);
        syncProductPublic(tx, [job.product_id], now);
      }
      // Gắn ảnh và đánh dấu xong trong cùng giao dịch.
      tx.prepare("UPDATE import_image_jobs SET status = 'done', message = NULL, locked_until = NULL, updated_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        job.id,
      );
      return !exists;
    });
    if (!attached) await discardStoredImage(processed.fileName);
    return { ...base, ok: true };
  } catch (error) {
    if (processed && !attached) await discardStoredImage(processed.fileName);
    // Tiến trình khác (hosting có thể chạy nhiều tiến trình) vừa gắn đúng ảnh này: coi là xong.
    if (db.prepare("SELECT 1 FROM product_images WHERE product_id = ? AND source_url = ?").get(job.product_id, job.url)) {
      finishJob(job.id, "done", null);
      return { ...base, ok: true };
    }
    const known = error instanceof ImageFetchError || error instanceof ImageRejectedError;
    const message = known ? (error as Error).message : "Lỗi hệ thống khi xử lý ảnh.";
    if (!known) console.error("[import] Lỗi ảnh:", error instanceof Error ? error.message : error);
    finishJob(job.id, "failed", message);
    return { ...base, ok: false, message };
  }
}

/**
 * Xử lý ảnh đang chờ của một lượt nhập trong giới hạn thời gian ngắn (mặc định 15 giây),
 * 2 ảnh song song. Trình duyệt gọi lặp lại tới khi hết ảnh chờ. Gọi lại sau khi bị ngắt
 * hoặc từ tab khác đều an toàn: mỗi ảnh được “giữ chỗ”, và CSDL chặn gắn trùng URL.
 */
export async function processImageJobs(batchId: string): Promise<ImageRoundResult> {
  const started = Date.now();
  const outcomes: ImageOutcome[] = [];
  const worker = async () => {
    while (Date.now() - started < IMAGE_BUDGET_MS) {
      const job = claimJob(batchId);
      if (!job) return;
      outcomes.push(await runJob(job));
    }
  };
  await Promise.all([worker(), worker()]);
  return { ...imageProgress(batchId), outcomes };
}

/** Các lượt nhập còn ảnh chờ (để tiếp tục khi lần trước bị ngắt hoặc đã đóng trang). */
export function batchesWithPendingImages(): { id: string; fileName: string; completedAt: string | null; pending: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT b.id, b.file_name, b.completed_at, COUNT(j.id) AS pending
       FROM import_batches b JOIN import_image_jobs j ON j.batch_id = b.id AND j.status = 'pending'
       GROUP BY b.id ORDER BY b.completed_at DESC LIMIT 10`,
    )
    .all() as { id: string; file_name: string; completed_at: string | null; pending: number }[];
  return rows.map((r) => ({ id: r.id, fileName: r.file_name, completedAt: r.completed_at, pending: r.pending }));
}
