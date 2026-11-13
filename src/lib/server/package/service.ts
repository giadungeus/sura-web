/**
 * Nhập gói nội dung ZIP: tải lên & kiểm tra → xử lý ảnh theo lượt ngắn → xem trước → xác nhận (MỘT giao dịch).
 * - Không bao giờ đổi giá, tồn kho, SKU, phiên bản hay danh mục sản phẩm.
 * - Lưu nháp: không đổi nội dung khách đang thấy, không đổi Ẩn/Hiện sản phẩm.
 * - Gửi xác nhận lại: trả kết quả cũ. Lỗi giữa chừng: SQLite huỷ toàn bộ giao dịch.
 * - Ảnh: tối ưu WebP theo vai trò; ảnh giống hệt (SHA-256) được dùng lại, không lưu trùng.
 * - Bỏ lượt/hết hạn (24 giờ)/nhập xong: xoá ZIP tạm và ảnh đã xử lý nhưng không được dùng.
 */
import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { IMAGE_LINE } from "@/lib/content/markup";
import { pageBySlug } from "@/lib/content/pages";
import { PENDING_CATEGORY_NAME, ensurePendingCategory, parseCategoryDraft, writePublicCategoryContent, type CategoryContent } from "@/lib/server/admin-catalog";
import { productSearchText } from "@/lib/server/catalog-seed";
import { findContentImage, imageMarkup, prepareImageFile } from "@/lib/server/content-images";
import { getDb, getDbPath, withTransaction } from "@/lib/server/db";
import { IMAGE_ROLES, ImageRejectedError, type ImageRole } from "@/lib/server/image-pipeline";
import { discardStoredImage, readStoredImage, writeStoredImage } from "@/lib/server/images";
import { PRODUCT_GALLERY_MAX, validatePackage, type ImgRef, type NewProduct, type PkgIssue, type PkgItem, type SeoPatch } from "@/lib/server/package/manifest";
import { syncNewsPublic, syncPagePublic, syncProductPublic } from "@/lib/server/public-state";
import { PackageRejectedError, readPackageZip } from "@/lib/server/package/zip";
import { MAX_VIDEOS_PER_PRODUCT, youtubeThumbUrl, type VideoOrientation, type VideoPlatform } from "@/lib/product-video";
import { appendVideos, existingVideoKeys, videoKey, type AppendVideo } from "@/lib/server/product-videos";

const TTL_MS = 24 * 60 * 60 * 1000;
/** Thời gian tối đa để BẮT ĐẦU ảnh mới trong một lượt (hosting iNET: yêu cầu ngắn). */
const IMAGE_BUDGET_MS = Number(process.env.SHOP_IMPORT_IMAGE_BUDGET_MS) || 12_000;
const JOB_LEASE_MS = 60_000;
const MAX_ATTEMPTS = 3;
const SOURCE_PREFIX = "goi:sha256:";

const tempDir = () => path.join(path.dirname(getDbPath()), "goi-tam");
const zipFile = (id: string) => path.join(/*turbopackIgnore: true*/ tempDir(), `${id}.zip`);
const nowIso = () => new Date().toISOString();
const ID_PATTERN = /^[0-9a-f-]{36}$/;
export const isPackageId = (v: unknown): v is string => typeof v === "string" && ID_PATTERN.test(v);

/** bai: ảnh trong bài · bia: ảnh bìa tin tức · sp:<id>: ảnh sản phẩm · vb:<id>: ảnh bìa video của sản phẩm. */
type Target = "bai" | "bia" | `sp:${string}` | `vb:${string}`;
const roleOf = (t: string): ImageRole => (t === "bai" ? "bai" : "bia");
type Stored = { name: string; author: string; date: string; items: PkgItem[]; images: [string, string][] };

// ═════════════════════ 1. Tải lên & kiểm tra ═════════════════════

export type UploadResult =
  | { ok: false; message: string; errors?: PkgIssue[]; warnings?: PkgIssue[] }
  | { ok: true; batchId: string; name: string; items: number; images: number; warnings: PkgIssue[] };

function lookupCategory(db: DatabaseSync) {
  const bySlug = db.prepare("SELECT id, name FROM categories WHERE slug = ?");
  return (slug: string) => {
    const row = bySlug.get(slug) as { id: number; name: string } | undefined;
    return row ? { id: row.id, label: row.name } : null;
  };
}

type CategoryRowFull = {
  id: number;
  slug: string;
  name: string;
  is_visible: number;
  description: string;
  body: string;
  seo_title: string | null;
  seo_description: string | null;
  draft_json: string | null;
};
const categoryRow = (db: DatabaseSync, id: number) =>
  db
    .prepare("SELECT id, slug, name, is_visible, description, body, seo_title, seo_description, draft_json FROM categories WHERE id = ?")
    .get(id) as CategoryRowFull | undefined;
const categoryPublic = (r: CategoryRowFull): CategoryContent => ({
  description: r.description,
  body: r.body,
  seoTitle: r.seo_title ?? "",
  seoDescription: r.seo_description ?? "",
});
/**
 * Chỉ những trường CÓ trong gói (khoá vắng mặt không có ở đây → giữ nguyên).
 * Chuỗi rỗng = xoá mô tả/nội dung, SEO về mặc định.
 */
function categoryPatch(item: Extract<PkgItem, { kind: "danh_muc" }>, resolvedBody: string): Partial<CategoryContent> {
  const g: Partial<CategoryContent> = {};
  if (item.summary !== undefined) g.description = item.summary;
  if (item.bodyGiven) g.body = resolvedBody;
  if (item.seo?.title !== undefined) g.seoTitle = item.seo.title ?? "";
  if (item.seo?.description !== undefined) g.seoDescription = item.seo.description ?? "";
  return g;
}
const CATEGORY_FIELD_LABEL: Record<keyof CategoryContent, string> = {
  description: "Mô tả ngắn",
  body: "Nội dung chi tiết",
  seoTitle: "Tiêu đề SEO",
  seoDescription: "Mô tả SEO",
};

function lookupProduct(db: DatabaseSync) {
  const bySlug = db.prepare("SELECT id, name FROM products WHERE slug = ?");
  const bySource = db.prepare("SELECT id, name FROM products WHERE source = ? AND source_code = ?");
  // Slug trước, rồi nguồn + mã: sản phẩm mới tạo từ gói (có nguồn + mã) vẫn được nhận ra khi nhập lại gói → không tạo trùng.
  return (ref: { slug?: string; source?: string; code?: string }) => {
    const row = ((ref.slug ? bySlug.get(ref.slug) : undefined) ??
      (ref.source && ref.code ? bySource.get(ref.source, ref.code) : undefined)) as { id: string; name: string } | undefined;
    return row ? { id: row.id, label: row.name } : null;
  };
}

export async function createPackageImport(buf: Buffer, fileName: string, username: string): Promise<UploadResult> {
  await cleanupExpiredPackages();
  let zip: Awaited<ReturnType<typeof readPackageZip>>;
  try {
    zip = await readPackageZip(buf);
  } catch (error) {
    if (error instanceof PackageRejectedError) return { ok: false, message: error.message };
    throw error;
  }
  const db = getDb();
  const v = validatePackage(zip.files, zip.ignored, lookupProduct(db), lookupCategory(db));
  if (v.errors.length) return { ok: false, message: "Gói có lỗi, chưa nhập gì. Sửa gói rồi tải lên lại.", errors: v.errors, warnings: v.warnings };

  // Ảnh cần xử lý: mỗi (ảnh gốc, nơi dùng) một việc. Ảnh sản phẩm tách riêng theo sản phẩm.
  const jobs = new Map<string, { path: string; sha: string; target: Target }>();
  const add = (p: string, target: Target) => jobs.set(`${target}|${p}`, { path: p, sha: v.images.get(p)!, target });
  for (const item of v.items) {
    for (const p of item.inline) add(p, "bai");
    if (item.kind === "san_pham") for (const img of [item.cover, ...item.gallery]) if (img) add(img.path, `sp:${item.productId}`);
    if (item.kind === "san_pham") for (const vid of item.videos ?? []) if (vid.cover) add(vid.cover, `vb:${item.productId}`);
    if (item.kind === "tin_tuc" && item.cover) add(item.cover.path, "bia");
  }

  const id = randomUUID();
  await mkdir(tempDir(), { recursive: true });
  await writeFile(zipFile(id), buf, { flag: "wx" });
  const stored: Stored = { name: v.name, author: v.author, date: v.date, items: v.items, images: [...v.images] };
  try {
    withTransaction((tx) => {
      const now = nowIso();
      tx.prepare(
        `INSERT INTO package_imports (id, admin_username, file_name, file_sha256, package_name, manifest_json, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'staging', ?)`,
      ).run(id, username, fileName.slice(0, 200), createHash("sha256").update(buf).digest("hex"), v.name || null, JSON.stringify(stored), now);
      const insert = tx.prepare(
        `INSERT INTO package_import_images (batch_id, zip_path, source_sha256, target, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
      );
      for (const j of jobs.values()) insert.run(id, j.path, j.sha, j.target, now);
    });
  } catch (error) {
    await unlink(zipFile(id)).catch(() => {});
    throw error;
  }
  return { ok: true, batchId: id, name: v.name, items: v.items.length, images: jobs.size, warnings: v.warnings };
}

// ═════════════════════ 2. Xử lý ảnh theo lượt ═════════════════════

export type PackageImageProgress = { total: number; done: number; failed: number; pending: number };
export type PackageImageOutcome = { path: string; ok: boolean; message?: string };

export function packageImageProgress(batchId: string): PackageImageProgress {
  const rows = getDb()
    .prepare("SELECT status, COUNT(*) n FROM package_import_images WHERE batch_id = ? GROUP BY status")
    .all(batchId) as { status: string; n: number }[];
  const c = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return { total: c("done") + c("failed") + c("pending"), done: c("done"), failed: c("failed"), pending: c("pending") };
}

type Job = { id: number; zip_path: string; source_sha256: string; target: string; attempts: number };

function claimJob(batchId: string): Job | null {
  const now = new Date();
  return (
    (getDb()
      .prepare(
        `UPDATE package_import_images SET locked_until = ?, attempts = attempts + 1, updated_at = ?
         WHERE id = (SELECT id FROM package_import_images WHERE batch_id = ? AND status = 'pending'
                     AND (locked_until IS NULL OR locked_until < ?) ORDER BY id LIMIT 1)
         RETURNING id, zip_path, source_sha256, target, attempts`,
      )
      .get(new Date(now.getTime() + JOB_LEASE_MS).toISOString(), now.toISOString(), batchId, now.toISOString()) as Job | undefined) ?? null
  );
}

function finishJob(id: number, fields: { status: "done" | "failed"; fileName?: string; width?: number; height?: number; sizeBytes?: number; reused?: boolean; overTarget?: boolean; message?: string }) {
  getDb()
    .prepare(
      `UPDATE package_import_images SET status = ?, file_name = ?, width = ?, height = ?, size_bytes = ?, reused = ?, over_target = ?,
         message = ?, locked_until = NULL, updated_at = ? WHERE id = ?`,
    )
    .run(
      fields.status,
      fields.fileName ?? null,
      fields.width ?? null,
      fields.height ?? null,
      fields.sizeBytes ?? null,
      fields.reused ? 1 : 0,
      fields.overTarget ? 1 : 0,
      fields.message ?? null,
      nowIso(),
      id,
    );
}

/** Ảnh sản phẩm đã có (đã gắn hoặc trong bản nháp trước) cho đúng ảnh gốc này. */
function existingProductImage(productId: string, sha: string) {
  const db = getDb();
  const attached = db
    .prepare("SELECT file_name, width, height, size_bytes FROM product_images WHERE product_id = ? AND source_url = ?")
    .get(productId, SOURCE_PREFIX + sha) as { file_name: string; width: number; height: number; size_bytes: number } | undefined;
  if (attached) return attached;
  const draft = readProductDraft(db, productId);
  const id = draft?.images.find((i) => i.sha === sha)?.imageId;
  if (!id) return undefined;
  return db.prepare("SELECT file_name, width, height, size_bytes FROM product_images WHERE id = ? AND product_id IS NULL").get(id) as
    | { file_name: string; width: number; height: number; size_bytes: number }
    | undefined;
}

/**
 * Ảnh giống hệt (cùng mã băm) đã được xử lý trong CHÍNH lượt nhập này cho vị trí tương đương:
 * - cùng vai trò (vd. cùng ảnh cho nhiều sản phẩm) → kết quả giống hệt;
 * - đã xử lý cho “bài” mà kết quả ≤ 1200px và ≤ mục tiêu ảnh bìa → mã hoá cho “bìa” cũng ra đúng tệp đó
 *   (ảnh nguồn không bị thu nhỏ, cùng chất lượng 82 → 76 → 70, dừng ở cùng bước).
 * Trả về tệp đã lưu để CHÉP ra tệp mới (ảnh sản phẩm cần tên tệp riêng), không mã hoá lại.
 */
function batchOutputFor(batchId: string, job: Job, role: ImageRole) {
  const rows = getDb()
    .prepare(
      `SELECT target, file_name, width, height, size_bytes, over_target FROM package_import_images
       WHERE batch_id = ? AND source_sha256 = ? AND status = 'done' AND reused = 0 AND file_name IS NOT NULL AND id <> ? ORDER BY id`,
    )
    .all(batchId, job.source_sha256, job.id) as { target: string; file_name: string; width: number; height: number; size_bytes: number; over_target: number }[];
  const bia = IMAGE_ROLES.bia;
  return (
    rows.find((r) => roleOf(r.target) === role) ??
    (role === "bia"
      ? rows.find((r) => roleOf(r.target) === "bai" && Math.max(r.width, r.height) <= bia.maxSide && r.size_bytes <= bia.targetBytes && !r.over_target)
      : undefined)
  );
}

async function runJob(batchId: string, job: Job, zipBuf: () => Promise<Buffer>): Promise<PackageImageOutcome> {
  const base = { path: job.zip_path };
  const role = roleOf(job.target);
  // Dùng lại ảnh đã có: không xử lý lại, không lưu thêm tệp.
  // Ảnh bìa video: luôn có tệp riêng (xoá video sẽ xoá tệp bìa của nó — không được dùng chung tệp với nội dung khác).
  const reuse = job.target.startsWith("vb:")
    ? undefined
    : job.target.startsWith("sp:")
    ? existingProductImage(job.target.slice(3), job.source_sha256)
    : (() => {
        const c = findContentImage(job.source_sha256, role);
        return c ? { file_name: c.fileName, width: c.width, height: c.height, size_bytes: c.sizeBytes } : undefined;
      })();
  if (reuse) {
    finishJob(job.id, { status: "done", fileName: reuse.file_name, width: reuse.width, height: reuse.height, sizeBytes: reuse.size_bytes, reused: true });
    return { ...base, ok: true };
  }
  if (job.attempts > MAX_ATTEMPTS) {
    finishJob(job.id, { status: "failed", message: "Đã thử 3 lần không thành công." });
    return { ...base, ok: false, message: "Đã thử 3 lần không thành công." };
  }
  try {
    const prior = batchOutputFor(batchId, job, role);
    const priorData = prior ? await readStoredImage(prior.file_name) : null;
    if (prior && priorData) {
      const fileName = await writeStoredImage(priorData);
      const status = getDb().prepare("SELECT status FROM package_imports WHERE id = ?").get(batchId) as { status: string } | undefined;
      if (status?.status !== "staging") {
        await discardStoredImage(fileName);
        return { ...base, ok: false, message: "Lượt nhập đã kết thúc." };
      }
      finishJob(job.id, { status: "done", fileName, width: prior.width, height: prior.height, sizeBytes: prior.size_bytes, overTarget: prior.over_target === 1 });
      return { ...base, ok: true };
    }
    const { files } = await readPackageZip(await zipBuf(), new Set([job.zip_path]));
    const data = files.get(job.zip_path);
    if (!data || createHash("sha256").update(data).digest("hex") !== job.source_sha256) throw new PackageRejectedError("Ảnh trong gói đã thay đổi.");
    const img = await prepareImageFile(data, role);
    // Lượt nhập đã bị bỏ trong lúc xử lý → không giữ tệp.
    const status = getDb().prepare("SELECT status FROM package_imports WHERE id = ?").get(batchId) as { status: string } | undefined;
    if (status?.status !== "staging") {
      await discardStoredImage(img.fileName);
      return { ...base, ok: false, message: "Lượt nhập đã kết thúc." };
    }
    finishJob(job.id, { status: "done", fileName: img.fileName, width: img.width, height: img.height, sizeBytes: img.sizeBytes, overTarget: img.overTarget });
    return { ...base, ok: true };
  } catch (error) {
    const known = error instanceof ImageRejectedError || error instanceof PackageRejectedError;
    const message = known ? (error as Error).message : "Lỗi hệ thống khi xử lý ảnh.";
    if (!known) console.error("[goi] Lỗi ảnh:", error instanceof Error ? error.message : error);
    finishJob(job.id, { status: "failed", message });
    return { ...base, ok: false, message };
  }
}

export async function processPackageImages(batchId: string): Promise<PackageImageProgress & { outcomes: PackageImageOutcome[] }> {
  const batch = getDb().prepare("SELECT status FROM package_imports WHERE id = ?").get(batchId) as { status: string } | undefined;
  if (batch?.status !== "staging") return { ...packageImageProgress(batchId), outcomes: [] };
  const started = Date.now();
  const outcomes: PackageImageOutcome[] = [];
  let buf: Buffer | null = null;
  const zipBuf = async () => (buf ??= await readFile(zipFile(batchId)));
  // Một ảnh mỗi lần: hosting ít RAM, sharp dùng nhiều bộ nhớ.
  while (Date.now() - started < IMAGE_BUDGET_MS) {
    const job = claimJob(batchId);
    if (!job) break;
    outcomes.push(await runJob(batchId, job, zipBuf));
  }
  return { ...packageImageProgress(batchId), outcomes };
}

// ═════════════════════ 3. Xem trước (dùng chung cho xác nhận) ═════════════════════

type ImgInfo = { fileName: string; width: number; height: number; sizeBytes: number; reused: boolean; overTarget: boolean; sha: string };
type ImageMap = Map<string, ImgInfo>; // key: `${target}|${zip path}`

function loadImages(db: DatabaseSync, batchId: string): { map: ImageMap; failed: PkgIssue[]; pending: number } {
  const rows = db.prepare("SELECT * FROM package_import_images WHERE batch_id = ? ORDER BY id").all(batchId) as {
    zip_path: string;
    source_sha256: string;
    target: string;
    status: string;
    file_name: string | null;
    width: number | null;
    height: number | null;
    size_bytes: number | null;
    reused: number;
    over_target: number;
    message: string | null;
  }[];
  const map: ImageMap = new Map();
  const failed: PkgIssue[] = [];
  let pending = 0;
  for (const r of rows) {
    if (r.status === "pending") pending++;
    else if (r.status === "failed") failed.push({ item: null, message: `Ảnh ${r.zip_path}: ${r.message ?? "không xử lý được"}. Hãy thay ảnh này trong gói.` });
    else if (r.file_name)
      map.set(`${r.target}|${r.zip_path}`, {
        fileName: r.file_name,
        width: r.width ?? 0,
        height: r.height ?? 0,
        sizeBytes: r.size_bytes ?? 0,
        reused: r.reused === 1,
        overTarget: r.over_target === 1,
        sha: r.source_sha256,
      });
  }
  return { map, failed, pending };
}

/** Đổi `anh/…` trong dòng ảnh thành ảnh đã lưu `/anh/<tên>.webp#rộngxcao`. */
function resolveBody(body: string, imgs: ImageMap): string {
  return body
    .split("\n")
    .map((line) => {
      const m = line.trim().match(IMAGE_LINE);
      const info = m && imgs.get(`bai|${m[2]}`);
      return m && info ? imageMarkup(info, m[1], m[3] ?? "") : line;
    })
    .join("\n");
}

export type PlanAction = "new" | "update" | "unchanged";
/** SEO sau khi áp gói (chuỗi rỗng = dùng mặc định). */
export type SeoValues = { seoTitle: string; seoDescription: string };
const NO_SEO: SeoValues = { seoTitle: "", seoDescription: "" };
/** Khoá vắng mặt → giữ giá trị đang lưu; null → về mặc định; chuỗi → giá trị mới. */
function applySeoPatch(cur: SeoValues, patch: SeoPatch | undefined): SeoValues {
  return {
    seoTitle: patch?.title === undefined ? cur.seoTitle : (patch.title ?? ""),
    seoDescription: patch?.description === undefined ? cur.seoDescription : (patch.description ?? ""),
  };
}
function seoChangeLabels(cur: SeoValues, next: SeoValues): string[] {
  const out: string[] = [];
  if (cur.seoTitle !== next.seoTitle) out.push(next.seoTitle ? "Tiêu đề SEO" : "Tiêu đề SEO → mặc định");
  if (cur.seoDescription !== next.seoDescription) out.push(next.seoDescription ? "Mô tả SEO" : "Mô tả SEO → mặc định");
  return out;
}
const nullIfEmpty = (v: string) => (v ? v : null);
function parseSeoJson(json: string | null | undefined): Partial<SeoValues> | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Partial<SeoValues>;
  } catch {
    return null;
  }
}
export type PlanImage = { url: string; alt: string; isNew: boolean };
/**
 * Video trong xem trước: position = vị trí sẽ có trong hàng “Video sản phẩm” (1 = đầu), null khi bỏ qua.
 * coverUrl: ảnh bìa trong gói (đã xử lý) → ảnh khung hình YouTube → null (thẻ nút phát, như trang sản phẩm).
 */
export type PlanVideo = {
  title: string;
  url: string;
  platform: VideoPlatform;
  orientation: VideoOrientation;
  coverUrl: string | null;
  coverFromPackage: boolean;
  action: "add" | "skip";
  position: number | null;
};
export type PlanItem = {
  index: number;
  kind: PkgItem["kind"];
  label: string;
  action: PlanAction;
  changes: string[];
  notes: string[];
  errors: string[];
  publicPath: string | null;
  adminPath: string | null;
  title: string;
  summary: string | null;
  body: string;
  currentBody: string | null;
  cover: PlanImage | null;
  gallery: PlanImage[];
  /** Video sản phẩm trong gói (rỗng khi gói không có "video_san_pham"). */
  videos: PlanVideo[];
  /** Số video sản phẩm đang có (chỉ mục san_pham có video trong gói). */
  existingVideos: number;
  /** SEO sau khi áp gói; null khi không xác định (mục lỗi). */
  seo: SeoValues | null;
  /** Sản phẩm MỚI: tạo trong “Danh mục chờ” (Ẩn). null = cập nhật sản phẩm đã có / không phải sản phẩm. */
  create: {
    category: string;
    slug: string;
    brand: string;
    variant: { sku: string; price: number; compareAtPrice: number | null; stock: number } | null;
    missing: string[];
  } | null;
};

type ProductDraft = {
  name: string | null;
  summary: string | null;
  description: string;
  images: { imageId: number; sha: string; alt: string }[];
  cover: boolean;
  batchId: string;
  savedAt: string;
  savedBy: string;
  /** Có từ v8; bản nháp cũ không có → áp dụng không đổi SEO. */
  seoTitle?: string;
  seoDescription?: string;
  /** Video nối thêm khi áp dụng (bỏ qua video trùng lúc áp dụng). Bản nháp cũ/gói không có video → không đổi video. */
  videos?: AppendVideo[];
};

function readProductDraft(db: DatabaseSync, productId: string): ProductDraft | null {
  const row = db.prepare("SELECT content_draft_json FROM products WHERE id = ?").get(productId) as { content_draft_json: string | null } | undefined;
  if (!row?.content_draft_json) return null;
  try {
    return JSON.parse(row.content_draft_json) as ProductDraft;
  } catch {
    return null;
  }
}

function computePlan(db: DatabaseSync, stored: Stored, imgs: ImageMap): PlanItem[] {
  const url = (f: string) => `/anh/${f}`;
  return stored.items.map((item): PlanItem => {
    const body = resolveBody(item.body, imgs);
    const plan: PlanItem = {
      index: item.index,
      kind: item.kind,
      label: item.label,
      action: "unchanged",
      changes: [],
      notes: [],
      errors: [],
      publicPath: null,
      adminPath: null,
      title: "",
      summary: null,
      body,
      currentBody: null,
      cover: null,
      gallery: [],
      videos: [],
      existingVideos: 0,
      seo: null,
      create: null,
    };
    const newInline = item.inline.filter((p) => !imgs.get(`bai|${p}`)?.reused).length;
    if (newInline) plan.notes.push(`${newInline} ảnh mới trong bài.`);

    if (item.kind === "san_pham" && item.create) {
      // ── Sản phẩm MỚI → “Danh mục chờ”, Ẩn ──
      const c = item.create;
      plan.action = "new";
      plan.title = c.name;
      plan.summary = item.summary;
      plan.create = { category: PENDING_CATEGORY_NAME, slug: c.slug, brand: c.brand, variant: c.variant, missing: c.missing };
      plan.changes.push(`Sản phẩm mới trong “${PENDING_CATEGORY_NAME}” (Ẩn)`);
      plan.notes.push("Chỉ thấy trong quản trị cho tới khi chọn danh mục chính thức và Hiện. Lưu nháp hay Công khai đều tạo sản phẩm ở trạng thái Ẩn.");
      plan.seo = applySeoPatch(NO_SEO, item.seo);
      // Trùng trong CSDL (có thể phát sinh sau lúc tải gói lên): slug, nguồn + mã, SKU.
      if (db.prepare("SELECT 1 FROM products WHERE slug = ?").get(c.slug)) plan.errors.push(`Slug “${c.slug}” đã thuộc sản phẩm khác.`);
      if (c.source && c.code && db.prepare("SELECT 1 FROM products WHERE source = ? AND source_code = ?").get(c.source, c.code))
        plan.errors.push(`Nguồn ${c.source}/${c.code} đã thuộc sản phẩm khác.`);
      if (c.variant && db.prepare("SELECT 1 FROM product_variants WHERE sku = ? COLLATE NOCASE").get(c.variant.sku))
        plan.errors.push(`SKU “${c.variant.sku}” đã thuộc sản phẩm khác.`);
      const seen = new Set<string>();
      for (const ref of [item.cover, ...item.gallery]) {
        if (!ref || seen.has(ref.path)) continue;
        seen.add(ref.path);
        const info = imgs.get(`sp:${item.productId}|${ref.path}`);
        if (!info) continue;
        const pi = { url: url(info.fileName), alt: ref.alt, isNew: true };
        if (ref === item.cover) plan.cover = pi;
        else plan.gallery.push(pi);
      }
      if (seen.size) plan.changes.push(`${seen.size} ảnh sản phẩm`);
      (item.videos ?? []).forEach((v, i) => {
        const info = v.cover ? imgs.get(`vb:${item.productId}|${v.cover}`) : undefined;
        plan.videos.push({
          title: v.title,
          url: v.url,
          platform: v.platform,
          orientation: v.orientation,
          coverUrl: info ? url(info.fileName) : v.platform === "youtube" ? youtubeThumbUrl(v.videoId) : null,
          coverFromPackage: !!info,
          action: "add",
          position: i + 1,
        });
      });
      if (plan.videos.length) plan.changes.push(`${plan.videos.length} video`);
      return plan;
    }

    if (item.kind === "san_pham") {
      const row = db
        .prepare(
          "SELECT id, slug, name, short_description, description, is_visible, content_draft_json, seo_title, seo_description FROM products WHERE id = ?",
        )
        .get(item.productId) as
        | {
            id: string;
            slug: string;
            name: string;
            short_description: string;
            description: string;
            is_visible: number;
            content_draft_json: string | null;
            seo_title: string | null;
            seo_description: string | null;
          }
        | undefined;
      if (!row) {
        plan.errors.push("Sản phẩm không còn tồn tại.");
        return plan;
      }
      plan.publicPath = `/san-pham/${row.slug}`;
      plan.adminPath = `/admin/san-pham/${row.id}`;
      plan.title = item.name ?? row.name;
      plan.summary = item.summary ?? row.short_description;
      plan.currentBody = row.description;
      plan.notes.unshift(row.is_visible ? "Sản phẩm đang Hiện." : "Sản phẩm đang Ẩn.");
      if (row.content_draft_json) plan.notes.push("Sản phẩm đang có bản nháp từ gói trước — sẽ được thay.");
      if (item.name && item.name !== row.name) plan.changes.push("Tên sản phẩm");
      if (item.summary !== null && item.summary !== row.short_description) plan.changes.push("Mô tả ngắn");
      if (body !== row.description) plan.changes.push("Bài mô tả");
      // SEO đang lưu: của bản nháp (nếu bản nháp có SEO), không thì của bản công khai.
      const draftSeo = parseSeoJson(row.content_draft_json);
      const curSeo: SeoValues = {
        seoTitle: draftSeo?.seoTitle ?? row.seo_title ?? "",
        seoDescription: draftSeo?.seoDescription ?? row.seo_description ?? "",
      };
      plan.seo = applySeoPatch(curSeo, item.seo);
      plan.changes.push(...seoChangeLabels(curSeo, plan.seo));
      const attached = db.prepare("SELECT file_name, is_primary FROM product_images WHERE product_id = ?").all(row.id) as {
        file_name: string;
        is_primary: number;
      }[];
      const attachedFiles = new Map(attached.map((a) => [a.file_name, a.is_primary === 1]));
      const seen = new Set<string>();
      let added = 0;
      const imgList = [item.cover, ...item.gallery].filter((x): x is ImgRef => !!x && !seen.has(x.path) && !!seen.add(x.path));
      for (const ref of imgList) {
        const info = imgs.get(`sp:${row.id}|${ref.path}`);
        if (!info) continue;
        const isNew = !attachedFiles.has(info.fileName);
        if (isNew) added++;
        const pi = { url: url(info.fileName), alt: ref.alt, isNew };
        if (ref === item.cover) plan.cover = pi;
        else plan.gallery.push(pi);
      }
      if (added) plan.changes.push(`${added} ảnh sản phẩm mới`);
      if (item.cover) {
        const info = imgs.get(`sp:${row.id}|${item.cover.path}`);
        if (info && attachedFiles.get(info.fileName) !== true) plan.changes.push("Ảnh đại diện");
      }
      if (attached.length + added > PRODUCT_GALLERY_MAX)
        plan.errors.push(`Sản phẩm sẽ có ${attached.length + added} ảnh, vượt tối đa ${PRODUCT_GALLERY_MAX}. Bớt ảnh trong gói hoặc xoá ảnh cũ trong trang sửa sản phẩm.`);

      // Video: nối vào sau video hiện có theo thứ tự trong gói; trùng (nền tảng + mã đã chuẩn hoá) → bỏ qua.
      if (item.videos) {
        const have = existingVideoKeys(db, row.id);
        plan.existingVideos = have.size;
        let next = have.size;
        for (const v of item.videos) {
          const dup = have.has(videoKey(v.platform, v.videoId));
          const info = v.cover ? imgs.get(`vb:${row.id}|${v.cover}`) : undefined;
          plan.videos.push({
            title: v.title,
            url: v.url,
            platform: v.platform,
            orientation: v.orientation,
            coverUrl: info ? url(info.fileName) : v.platform === "youtube" ? youtubeThumbUrl(v.videoId) : null,
            coverFromPackage: !!info,
            action: dup ? "skip" : "add",
            position: dup ? null : ++next,
          });
        }
        const adds = plan.videos.filter((v) => v.action === "add").length;
        const skips = plan.videos.length - adds;
        if (adds) plan.changes.push(`${adds} video mới`);
        if (skips) plan.notes.push(`${skips} video đã có trên sản phẩm — bỏ qua.`);
        if (next > MAX_VIDEOS_PER_PRODUCT)
          plan.errors.push(`Sản phẩm sẽ có ${next} video, vượt tối đa ${MAX_VIDEOS_PER_PRODUCT}. Bớt video trong gói hoặc xoá video cũ trong trang sửa sản phẩm.`);
      }
    } else if (item.kind === "tin_tuc") {
      const row = db.prepare("SELECT * FROM news_posts WHERE slug = ?").get(item.slug) as
        | {
            id: number;
            title: string;
            summary: string;
            body: string;
            cover_file: string | null;
            cover_alt: string | null;
            draft_json: string | null;
            is_public: number;
            published_at: string | null;
            seo_title: string | null;
            seo_description: string | null;
          }
        | undefined;
      const coverInfo = item.cover ? imgs.get(`bia|${item.cover.path}`) : undefined;
      plan.title = item.title;
      plan.summary = item.summary;
      plan.cover = coverInfo && item.cover ? { url: url(coverInfo.fileName), alt: item.cover.alt, isNew: !coverInfo.reused } : null;
      plan.publicPath = `/tin-tuc/${item.slug}`;
      if (!row) {
        plan.action = "new";
        plan.changes.push("Bài tin tức mới");
        plan.seo = applySeoPatch(NO_SEO, item.seo);
        return plan;
      }
      plan.adminPath = `/admin/tin-tuc/${row.id}`;
      let cur: { title: string; summary: string; body: string; coverFile: string | null; coverAlt?: string } & Partial<SeoValues> = {
        title: row.title,
        summary: row.summary,
        body: row.body,
        coverFile: row.cover_file,
        coverAlt: row.cover_alt ?? "",
      };
      if (row.draft_json) {
        try {
          cur = JSON.parse(row.draft_json);
          plan.notes.push("Bài đang có bản nháp — so sánh với bản nháp.");
        } catch {}
      }
      plan.currentBody = cur.body;
      plan.notes.unshift(row.is_public ? "Bài đang Công khai." : row.published_at ? "Bài đang Ẩn." : "Bài đang là Nháp.");
      if (cur.title !== item.title) plan.changes.push("Tiêu đề");
      if (cur.summary !== item.summary) plan.changes.push("Mô tả ngắn");
      if (cur.body !== body) plan.changes.push("Nội dung");
      if ((cur.coverFile ?? null) !== (coverInfo?.fileName ?? null)) plan.changes.push("Ảnh đại diện");
      else if (item.cover && (cur.coverAlt ?? "") !== item.cover.alt) plan.changes.push("Mô tả ảnh đại diện");
      const curSeo: SeoValues = { seoTitle: cur.seoTitle ?? row.seo_title ?? "", seoDescription: cur.seoDescription ?? row.seo_description ?? "" };
      plan.seo = applySeoPatch(curSeo, item.seo);
      plan.changes.push(...seoChangeLabels(curSeo, plan.seo));
    } else if (item.kind === "danh_muc") {
      const row = categoryRow(db, item.categoryId);
      if (!row) {
        plan.errors.push("Danh mục không còn tồn tại.");
        return plan;
      }
      const pub = categoryPublic(row);
      const draft = parseCategoryDraft(row);
      const given = categoryPatch(item, body);
      const next = { ...pub, ...given };
      plan.publicPath = `/danh-muc/${row.slug}`;
      plan.adminPath = `/admin/danh-muc/${row.id}`;
      plan.title = row.name;
      plan.summary = next.description || null;
      plan.body = next.body;
      plan.currentBody = pub.body;
      plan.seo = { seoTitle: next.seoTitle, seoDescription: next.seoDescription };
      plan.notes.unshift(row.is_visible ? "Danh mục đang Hiện." : "Danh mục đang Ẩn — Công khai nội dung không làm hiện danh mục.");
      if (draft)
        plan.notes.push(
          "Danh mục đang có bản nháp: Lưu nháp cập nhật bản nháp (trường không có trong gói giữ theo bản nháp); Công khai chỉ áp dụng các trường có trong gói, phần còn lại của bản nháp không bị công khai.",
        );
      for (const k of Object.keys(given) as (keyof CategoryContent)[]) {
        const v = given[k]!;
        if (v !== pub[k] || (draft && v !== draft[k])) plan.changes.push(v ? CATEGORY_FIELD_LABEL[k] : `${CATEGORY_FIELD_LABEL[k]} → ${k.startsWith("seo") ? "mặc định" : "xoá"}`);
      }
    } else {
      const row = db
        .prepare("SELECT title, body, draft_title, draft_body, draft_seo_json, seo_title, seo_description, is_public FROM content_pages WHERE slug = ?")
        .get(item.slug) as
        | {
            title: string;
            body: string;
            draft_title: string | null;
            draft_body: string | null;
            draft_seo_json: string | null;
            seo_title: string | null;
            seo_description: string | null;
            is_public: number;
          }
        | undefined;
      const def = pageBySlug(item.slug)!;
      plan.title = item.title;
      plan.publicPath = def.path;
      plan.adminPath = `/admin/noi-dung/${item.slug}`;
      if (!row) {
        plan.action = "new";
        plan.changes.push("Trang mới");
        plan.seo = applySeoPatch(NO_SEO, item.seo);
        return plan;
      }
      const curTitle = row.draft_title ?? row.title;
      const curBody = row.draft_body ?? row.body;
      plan.currentBody = curBody;
      plan.notes.unshift(row.is_public ? "Trang đang Công khai." : "Trang đang là Nháp.");
      if (row.draft_body !== null) plan.notes.push("Trang đang có bản nháp — so sánh với bản nháp.");
      if (curTitle !== item.title) plan.changes.push("Tiêu đề");
      if (curBody !== body) plan.changes.push("Nội dung");
      const draftSeo = parseSeoJson(row.draft_seo_json);
      const curSeo: SeoValues = {
        seoTitle: draftSeo?.seoTitle ?? row.seo_title ?? "",
        seoDescription: draftSeo?.seoDescription ?? row.seo_description ?? "",
      };
      plan.seo = applySeoPatch(curSeo, item.seo);
      plan.changes.push(...seoChangeLabels(curSeo, plan.seo));
    }
    if (plan.changes.length) plan.action = "update";
    return plan;
  });
}

export type PackagePreview =
  | { ok: false; message: string }
  | {
      ok: true;
      batchId: string;
      name: string;
      author: string;
      date: string;
      fileName: string;
      status: string;
      createdAt: string;
      result: CommitSummary | null;
      progress: PackageImageProgress;
      imageNotes: string[];
      errors: PkgIssue[];
      items: PlanItem[];
      ready: boolean;
    };

export function getPackagePreview(batchId: string): PackagePreview {
  const db = getDb();
  const batch = db.prepare("SELECT * FROM package_imports WHERE id = ?").get(batchId) as
    | { id: string; file_name: string; manifest_json: string; status: string; result_json: string | null; created_at: string }
    | undefined;
  if (!batch) return { ok: false, message: "Không tìm thấy lượt nhập." };
  const stored = JSON.parse(batch.manifest_json) as Stored;
  const { map, failed, pending } = loadImages(db, batchId);
  const items = computePlan(db, stored, map);
  const errors: PkgIssue[] = [...failed, ...items.flatMap((p) => p.errors.map((message) => ({ item: p.index, message })))];
  const imageNotes = [...map.entries()]
    .filter(([, i]) => i.overTarget)
    .map(([k, i]) => `${k.split("|")[1]}: ${Math.round(i.sizeBytes / 1024)} KB sau tối ưu (trên mục tiêu, vẫn trong giới hạn 500 KB).`);
  return {
    ok: true,
    batchId,
    name: stored.name,
    author: stored.author,
    date: stored.date,
    fileName: batch.file_name,
    status: batch.status,
    createdAt: batch.created_at,
    result: batch.result_json ? (JSON.parse(batch.result_json) as CommitSummary) : null,
    progress: packageImageProgress(batchId),
    imageNotes: [...new Set(imageNotes)],
    errors,
    items,
    ready: batch.status === "staging" && pending === 0 && errors.length === 0,
  };
}

// ═════════════════════ 4. Xác nhận (một giao dịch) ═════════════════════

export type CommitMode = "draft" | "publish";
export type CommitSummary = {
  mode: CommitMode;
  items: { label: string; kind: PkgItem["kind"]; action: PlanAction; adminPath: string | null; publicPath: string | null }[];
};
export type CommitResult = { ok: true; alreadyApplied: boolean; summary: CommitSummary } | { ok: false; message: string; errors?: PkgIssue[] };

/** Gắn ảnh trong bản nháp vào sản phẩm và áp dụng nội dung. Không đổi giá, tồn kho, SKU, phiên bản, danh mục. */
export function applyProductDraft(db: DatabaseSync, productId: string, draft: ProductDraft, opts: { setVisible: boolean }) {
  const product = db.prepare("SELECT name, brand, slug, short_description FROM products WHERE id = ?").get(productId) as
    | { name: string; brand: string; slug: string; short_description: string }
    | undefined;
  if (!product) throw new Error("Sản phẩm không còn tồn tại.");
  let attachedCount = (db.prepare("SELECT COUNT(*) n FROM product_images WHERE product_id = ?").get(productId) as { n: number }).n;
  const ids: number[] = [];
  for (const img of draft.images) {
    const row = db.prepare("SELECT id, product_id, source_url FROM product_images WHERE id = ?").get(img.imageId) as
      | { id: number; product_id: string | null; source_url: string | null }
      | undefined;
    if (!row) continue;
    let id = row.id;
    if (row.product_id === null) {
      const dup = row.source_url
        ? (db.prepare("SELECT id FROM product_images WHERE product_id = ? AND source_url = ?").get(productId, row.source_url) as { id: number } | undefined)
        : undefined;
      if (dup) id = dup.id;
      else {
        if (attachedCount >= PRODUCT_GALLERY_MAX) throw new Error(`Sản phẩm đã đủ ${PRODUCT_GALLERY_MAX} ảnh.`);
        const pos = (db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM product_images WHERE product_id = ?").get(productId) as { p: number }).p;
        db.prepare("UPDATE product_images SET product_id = ?, position = ? WHERE id = ?").run(productId, pos, row.id);
        attachedCount++;
      }
    } else if (row.product_id !== productId) continue;
    db.prepare("UPDATE product_images SET alt = ? WHERE id = ?").run(img.alt || null, id);
    ids.push(id);
  }
  if (draft.cover && ids[0] !== undefined) {
    db.prepare("UPDATE product_images SET is_primary = 0 WHERE product_id = ?").run(productId);
    db.prepare("UPDATE product_images SET is_primary = 1 WHERE id = ?").run(ids[0]);
  } else if (ids.length && !db.prepare("SELECT 1 FROM product_images WHERE product_id = ? AND is_primary = 1").get(productId)) {
    db.prepare("UPDATE product_images SET is_primary = 1 WHERE id = ?").run(ids[0]);
  }
  const name = draft.name ?? product.name;
  db.prepare(
    `UPDATE products SET name = ?, short_description = ?, description = ?, search_text = ?, content_draft_json = NULL,
       is_visible = CASE WHEN ? THEN 1 ELSE is_visible END, updated_at = ? WHERE id = ?`,
  ).run(
    name,
    draft.summary ?? product.short_description,
    draft.description,
    productSearchText(name, product.brand, product.slug),
    opts.setVisible ? 1 : 0,
    nowIso(),
    productId,
  );
  // Bản nháp từ v8 mang SEO đã tính sẵn; bản nháp cũ không có → giữ nguyên SEO.
  if (draft.seoTitle !== undefined || draft.seoDescription !== undefined) {
    const cur = db.prepare("SELECT seo_title, seo_description FROM products WHERE id = ?").get(productId) as {
      seo_title: string | null;
      seo_description: string | null;
    };
    db.prepare("UPDATE products SET seo_title = ?, seo_description = ? WHERE id = ?").run(
      draft.seoTitle !== undefined ? nullIfEmpty(draft.seoTitle) : cur.seo_title,
      draft.seoDescription !== undefined ? nullIfEmpty(draft.seoDescription) : cur.seo_description,
      productId,
    );
  }
  // Video từ gói: nối sau video hiện có, bỏ qua video đã có (kể cả video được thêm tay sau khi lưu nháp).
  if (draft.videos?.length) appendVideos(db, productId, draft.videos, nowIso());
  syncProductPublic(db, [productId]);
}

export function commitPackage(batchId: string, mode: CommitMode, username: string): CommitResult {
  type Outcome =
    | { kind: "missing" | "cancelled" | "expired" | "notReady"; errors?: PkgIssue[] }
    | { kind: "already" | "ok"; summary: CommitSummary };
  let outcome: Outcome;
  try {
    outcome = withTransaction((tx): Outcome => {
      const batch = tx.prepare("SELECT * FROM package_imports WHERE id = ?").get(batchId) as
        | { manifest_json: string; status: string; result_json: string | null; created_at: string }
        | undefined;
      if (!batch) return { kind: "missing" };
      if (batch.status === "applied" && batch.result_json) return { kind: "already", summary: JSON.parse(batch.result_json) };
      if (batch.status !== "staging") return { kind: "cancelled" };
      if (Date.parse(batch.created_at) < Date.now() - TTL_MS) return { kind: "expired" };
      const stored = JSON.parse(batch.manifest_json) as Stored;
      const { map, failed, pending } = loadImages(tx, batchId);
      if (pending || failed.length) return { kind: "notReady", errors: failed };

      // Ảnh trong bài/ảnh bìa: nếu đã có bản lưu cùng ảnh gốc thì dùng bản đó; chưa có thì ghi nhận tệp vừa xử lý.
      const now = nowIso();
      for (const [key, info] of map) {
        const target = key.split("|")[0];
        if (target !== "bai" && target !== "bia") continue;
        const existing = findContentImageTx(tx, info.sha, target);
        if (existing) {
          info.fileName = existing.file_name;
          info.width = existing.width;
          info.height = existing.height;
        } else if (!info.reused) {
          tx.prepare(
            `INSERT INTO content_images (file_name, source_sha256, variant, width, height, size_bytes, uploaded_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(info.fileName, info.sha, target, info.width, info.height, info.sizeBytes, username, now);
        }
      }

      const plans = computePlan(tx, stored, map);
      const errors = plans.flatMap((p) => p.errors.map((message) => ({ item: p.index, message })));
      if (errors.length) return { kind: "notReady", errors };

      for (const [i, item] of stored.items.entries()) {
        const plan = plans[i];
        if (plan.action === "unchanged") continue;
        if (item.kind === "san_pham") applyProductItem(tx, item, plan, map, mode, batchId, username);
        else if (item.kind === "tin_tuc") applyNewsItem(tx, item, plan, map, mode, username);
        else if (item.kind === "danh_muc") applyCategoryItem(tx, item, plan, mode);
        else applyPageItem(tx, item, plan, mode, username);
      }
      const summary: CommitSummary = {
        mode,
        items: plans.map((p) => ({
          label: p.label,
          kind: p.kind,
          action: p.action,
          publicPath: p.publicPath,
          adminPath: p.adminPath ?? (p.kind === "tin_tuc" ? newsAdminPath(tx, p.publicPath) : null),
        })),
      };
      tx.prepare("UPDATE package_imports SET status = 'applied', result_json = ?, completed_at = ? WHERE id = ?").run(
        JSON.stringify(summary),
        now,
        batchId,
      );
      return { kind: "ok", summary };
    });
  } catch (error) {
    console.error("[goi] Lỗi ghi dữ liệu:", error instanceof Error ? error.message : error);
    return { ok: false, message: "Không ghi được do lỗi hệ thống; chưa có thay đổi nào được lưu. Có thể bấm xác nhận lại." };
  }
  switch (outcome.kind) {
    case "missing":
      return { ok: false, message: "Không tìm thấy lượt nhập." };
    case "cancelled":
      return { ok: false, message: "Lượt nhập này đã bị bỏ. Hãy tải gói lên lại." };
    case "expired":
      return { ok: false, message: "Lượt nhập đã quá 24 giờ. Hãy tải gói lên lại." };
    case "notReady":
      return { ok: false, message: "Gói chưa sẵn sàng (ảnh chưa xử lý xong hoặc còn lỗi). Chưa ghi gì.", errors: outcome.errors };
    default:
      void cleanupBatchFiles(batchId); // ZIP tạm + ảnh đã xử lý nhưng không dùng
      return { ok: true, alreadyApplied: outcome.kind === "already", summary: outcome.summary };
  }
}

function findContentImageTx(db: DatabaseSync, sha: string, variant: string) {
  return db.prepare("SELECT file_name, width, height FROM content_images WHERE source_sha256 = ? AND variant = ?").get(sha, variant) as
    | { file_name: string; width: number; height: number }
    | undefined;
}

function newsAdminPath(db: DatabaseSync, publicPath: string | null) {
  const slug = publicPath?.split("/").pop();
  const row = slug ? (db.prepare("SELECT id FROM news_posts WHERE slug = ?").get(slug) as { id: number } | undefined) : undefined;
  return row ? `/admin/tin-tuc/${row.id}` : null;
}

function applyProductItem(
  db: DatabaseSync,
  item: Extract<PkgItem, { kind: "san_pham" }>,
  plan: PlanItem,
  imgs: ImageMap,
  mode: CommitMode,
  batchId: string,
  username: string,
) {
  const images: ProductDraft["images"] = [];
  const seen = new Set<string>();
  for (const ref of [item.cover, ...item.gallery]) {
    if (!ref || seen.has(ref.path)) continue;
    seen.add(ref.path);
    const info = imgs.get(`sp:${item.productId}|${ref.path}`);
    if (!info) continue;
    let row = db.prepare("SELECT id FROM product_images WHERE file_name = ?").get(info.fileName) as { id: number } | undefined;
    if (!row) {
      const r = db
        .prepare(
          `INSERT INTO product_images (product_id, file_name, width, height, size_bytes, position, is_primary, uploaded_by, source_url, alt, created_at)
           VALUES (NULL, ?, ?, ?, ?, 0, 0, 'goi-noi-dung', ?, ?, ?)`,
        )
        .run(info.fileName, info.width, info.height, info.sizeBytes, SOURCE_PREFIX + info.sha, ref.alt, nowIso());
      row = { id: Number(r.lastInsertRowid) };
    }
    images.push({ imageId: row.id, sha: info.sha, alt: ref.alt });
  }
  // Video: chỉ video sẽ thêm (theo thứ tự gói), kèm tệp ảnh bìa đã xử lý (nếu gói có ảnh bìa).
  const videos: AppendVideo[] | undefined = item.videos
    ?.filter((_, i) => plan.videos[i]?.action === "add")
    .map((v) => ({
      title: v.title,
      url: v.url,
      platform: v.platform,
      videoId: v.videoId,
      orientation: v.orientation,
      coverFile: v.cover ? (imgs.get(`vb:${item.productId}|${v.cover}`)?.fileName ?? null) : null,
    }));
  const draft: ProductDraft = {
    name: item.name,
    summary: item.summary,
    description: plan.body,
    images,
    cover: !!item.cover,
    batchId,
    savedAt: nowIso(),
    savedBy: username,
    ...(plan.seo ?? {}),
    ...(videos?.length ? { videos } : {}),
  };
  if (item.create) {
    // Sản phẩm MỚI: tạo trong “Danh mục chờ” ở trạng thái Ẩn rồi áp nội dung ngay (khách không thấy, không cần bản nháp).
    const id = createPendingProduct(db, item.create, item.summary ?? "");
    applyProductDraft(db, id, draft, { setVisible: false });
    const slug = item.create.slug;
    plan.adminPath = `/admin/san-pham/${id}`;
    plan.publicPath = `/san-pham/${slug}`;
    return;
  }
  // Sản phẩm ĐÃ CÓ: giữ nguyên danh mục và trạng thái Ẩn/Hiện (kể cả khi chọn Công khai).
  if (mode === "publish") applyProductDraft(db, item.productId, draft, { setVisible: false });
  else db.prepare("UPDATE products SET content_draft_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(draft), nowIso(), item.productId);
}

/**
 * Tạo sản phẩm mới từ gói: “Danh mục chờ”, Ẩn. Phiên bản chỉ tạo khi gói ghi đủ SKU, giá bán, tồn kho (đã kiểm tra theo quy
 * tắc form); thiếu thì để trống cho quản trị bổ sung — KHÔNG tự điền giá hay tồn kho.
 */
function createPendingProduct(db: DatabaseSync, c: NewProduct, summary: string): string {
  const categoryId = ensurePendingCategory(db);
  const id = `sp-${randomBytes(4).toString("hex")}`;
  const t = nowIso();
  db.prepare(
    `INSERT INTO products (id, slug, name, brand, category_id, short_description, description, option_names_json, placeholder_tone,
                           placeholder_icon, is_visible, search_text, source, source_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '', '[]', 'slate', 'shopping-bag', 0, ?, ?, ?, ?, ?)`,
  ).run(id, c.slug, c.name, c.brand, categoryId, summary, productSearchText(c.name, c.brand, c.slug), c.source, c.code, t, t);
  if (c.variant)
    db.prepare(
      `INSERT INTO product_variants (product_id, sku, options_json, options_key, price, compare_at_price, stock, position, is_active)
       VALUES (?, ?, '{}', '', ?, ?, ?, 0, 1)`,
    ).run(id, c.variant.sku, c.variant.price, c.variant.compareAtPrice, c.variant.stock);
  return id;
}

function applyNewsItem(db: DatabaseSync, item: Extract<PkgItem, { kind: "tin_tuc" }>, plan: PlanItem, imgs: ImageMap, mode: CommitMode, username: string) {
  const now = nowIso();
  const coverFile = item.cover ? (imgs.get(`bia|${item.cover.path}`)?.fileName ?? null) : null;
  const coverAlt = coverFile && item.cover ? item.cover.alt : null;
  const seo = plan.seo ?? NO_SEO;
  const fields = { title: item.title, slug: item.slug, summary: item.summary, body: plan.body, coverFile, coverAlt: coverAlt ?? "", ...seo };
  const row = db.prepare("SELECT id, is_public FROM news_posts WHERE slug = ?").get(item.slug) as { id: number; is_public: number } | undefined;
  const setSeo = (id: number) =>
    db.prepare("UPDATE news_posts SET seo_title = ?, seo_description = ? WHERE id = ?").run(nullIfEmpty(seo.seoTitle), nullIfEmpty(seo.seoDescription), id);
  let id: number;
  if (!row) {
    const r = db.prepare(
      `INSERT INTO news_posts (slug, title, summary, body, cover_file, cover_alt, is_public, published_at, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(item.slug, item.title, item.summary, plan.body, coverFile, coverAlt, mode === "publish" ? 1 : 0, mode === "publish" ? now : null, now, now, username);
    id = Number(r.lastInsertRowid);
    setSeo(id);
  } else if (mode === "publish") {
    id = row.id;
    db.prepare(
      `UPDATE news_posts SET title = ?, summary = ?, body = ?, cover_file = ?, cover_alt = ?, draft_json = NULL, is_public = 1,
         published_at = COALESCE(published_at, ?), updated_at = ?, updated_by = ? WHERE id = ?`,
    ).run(item.title, item.summary, plan.body, coverFile, coverAlt, now, now, username, row.id);
    setSeo(id);
  } else if (row.is_public) {
    // Bản nháp của bài đang công khai: SEO nằm trong bản nháp, metadata công khai giữ nguyên.
    id = row.id;
    db.prepare("UPDATE news_posts SET draft_json = ?, updated_at = ?, updated_by = ? WHERE id = ?").run(JSON.stringify(fields), now, username, row.id);
  } else {
    id = row.id;
    db.prepare(
      "UPDATE news_posts SET title = ?, summary = ?, body = ?, cover_file = ?, cover_alt = ?, draft_json = NULL, updated_at = ?, updated_by = ? WHERE id = ?",
    ).run(item.title, item.summary, plan.body, coverFile, coverAlt, now, username, row.id);
    setSeo(id);
  }
  syncNewsPublic(db, id, now);
}

/**
 * Danh mục (không đổi tên, slug, cha, thứ tự, biểu tượng, Hiện/Ẩn hay sản phẩm):
 * - Lưu nháp: bản nháp = (bản nháp đang có, hoặc bản công khai nếu chưa có) + các trường trong gói.
 * - Công khai: bản công khai = bản công khai + CHỈ các trường trong gói (không xuất bản phần khác của bản nháp cũ);
 *   nếu đang có bản nháp thì cập nhật cùng các trường đó vào bản nháp để bản nháp không ghi đè ngược lại sau này.
 */
function applyCategoryItem(db: DatabaseSync, item: Extract<PkgItem, { kind: "danh_muc" }>, plan: PlanItem, mode: CommitMode) {
  const row = categoryRow(db, item.categoryId);
  if (!row) throw new Error("Danh mục không còn tồn tại.");
  const pub = categoryPublic(row);
  const draft = parseCategoryDraft(row);
  const given = categoryPatch(item, plan.body);
  const now = nowIso();
  if (mode === "draft") {
    db.prepare("UPDATE categories SET draft_json = ?, updated_at = ? WHERE id = ?").run(JSON.stringify({ ...(draft ?? pub), ...given }), now, row.id);
    return;
  }
  writePublicCategoryContent(db, row.id, { ...pub, ...given }, now);
  if (draft) db.prepare("UPDATE categories SET draft_json = ? WHERE id = ?").run(JSON.stringify({ ...draft, ...given }), row.id);
}

function applyPageItem(db: DatabaseSync, item: Extract<PkgItem, { kind: "trang" }>, plan: PlanItem, mode: CommitMode, username: string) {
  const now = nowIso();
  const seo = plan.seo ?? NO_SEO;
  const row = db.prepare("SELECT is_public FROM content_pages WHERE slug = ?").get(item.slug) as { is_public: number } | undefined;
  const setSeo = () =>
    db.prepare("UPDATE content_pages SET seo_title = ?, seo_description = ?, draft_seo_json = NULL WHERE slug = ?").run(
      nullIfEmpty(seo.seoTitle),
      nullIfEmpty(seo.seoDescription),
      item.slug,
    );
  if (!row) {
    db.prepare(
      "INSERT INTO content_pages (slug, title, body, is_public, published_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(item.slug, item.title, plan.body, mode === "publish" ? 1 : 0, mode === "publish" ? now : null, now, username);
    setSeo();
  } else if (mode === "publish") {
    db.prepare(
      `UPDATE content_pages SET title = ?, body = ?, draft_title = NULL, draft_body = NULL, is_public = 1, published_at = ?,
         updated_at = ?, updated_by = ? WHERE slug = ?`,
    ).run(item.title, plan.body, now, now, username, item.slug);
    setSeo();
  } else if (row.is_public) {
    // Bản nháp của trang đang công khai: SEO đi cùng bản nháp.
    db.prepare("UPDATE content_pages SET draft_title = ?, draft_body = ?, draft_seo_json = ?, updated_at = ?, updated_by = ? WHERE slug = ?").run(
      item.title,
      plan.body,
      JSON.stringify(seo),
      now,
      username,
      item.slug,
    );
  } else {
    db.prepare(
      "UPDATE content_pages SET title = ?, body = ?, draft_title = NULL, draft_body = NULL, updated_at = ?, updated_by = ? WHERE slug = ?",
    ).run(item.title, plan.body, now, username, item.slug);
    setSeo();
  }
  syncPagePublic(db, item.slug, now);
}

// ═════════════════════ 5. Bỏ lượt, dọn tệp ═════════════════════

/** Xoá ZIP tạm và các ảnh đã xử lý cho lượt này nhưng không được CSDL dùng tới. */
export async function cleanupBatchFiles(batchId: string): Promise<number> {
  const db = getDb();
  const rows = db
    .prepare("SELECT DISTINCT file_name FROM package_import_images WHERE batch_id = ? AND reused = 0 AND file_name IS NOT NULL")
    .all(batchId) as { file_name: string }[];
  const inContent = db.prepare("SELECT 1 FROM content_images WHERE file_name = ?");
  const inProduct = db.prepare("SELECT 1 FROM product_images WHERE file_name = ?");
  // Ảnh bìa video: đang gắn với video, hoặc nằm trong bản nháp sản phẩm chờ áp dụng.
  const inVideo = db.prepare("SELECT 1 FROM product_videos WHERE cover_file = ?");
  const inDraft = db.prepare("SELECT 1 FROM products WHERE content_draft_json LIKE ? LIMIT 1");
  let removed = 0;
  for (const { file_name } of rows) {
    if (inContent.get(file_name) || inProduct.get(file_name) || inVideo.get(file_name) || inDraft.get(`%${file_name}%`)) continue;
    await discardStoredImage(file_name);
    removed++;
  }
  await unlink(zipFile(batchId)).catch(() => {});
  return removed;
}

export async function cancelPackageImport(batchId: string): Promise<{ ok: boolean; message: string }> {
  const r = getDb()
    .prepare("UPDATE package_imports SET status = 'cancelled', completed_at = ? WHERE id = ? AND status = 'staging'")
    .run(nowIso(), batchId);
  if (!r.changes) return { ok: false, message: "Lượt nhập không còn ở bước chờ xác nhận." };
  const removed = await cleanupBatchFiles(batchId);
  return { ok: true, message: `Đã bỏ lượt nhập${removed ? `, xoá ${removed} ảnh tạm` : ""}. Không có nội dung nào thay đổi.` };
}

/** Lượt nhập chờ quá 24 giờ: bỏ và dọn tệp. */
export async function cleanupExpiredPackages(): Promise<void> {
  const cutoff = new Date(Date.now() - TTL_MS).toISOString();
  const ids = getDb().prepare("SELECT id FROM package_imports WHERE status = 'staging' AND created_at < ?").all(cutoff) as { id: string }[];
  for (const { id } of ids) await cancelPackageImport(id);
}

export type PackageListItem = { id: string; name: string; fileName: string; status: string; createdAt: string; admin: string };

export function listPackageImports(limit = 10): PackageListItem[] {
  return (
    getDb()
      .prepare("SELECT id, package_name, file_name, status, created_at, admin_username FROM package_imports ORDER BY created_at DESC LIMIT ?")
      .all(limit) as { id: string; package_name: string | null; file_name: string; status: string; created_at: string; admin_username: string }[]
  ).map((r) => ({ id: r.id, name: r.package_name ?? "", fileName: r.file_name, status: r.status, createdAt: r.created_at, admin: r.admin_username }));
}

// ═════════════════════ Bản nháp bài sản phẩm (trang sửa sản phẩm) ═════════════════════

export type ProductDraftInfo = {
  savedAt: string;
  savedBy: string;
  name: string | null;
  summary: string | null;
  description: string;
  images: { url: string; alt: string }[];
  videos: { title: string; url: string; platform: VideoPlatform }[];
  /** undefined = bản nháp không đổi SEO. */
  seoTitle?: string;
  seoDescription?: string;
};

export function getProductDraftInfo(productId: string): ProductDraftInfo | null {
  const db = getDb();
  const d = readProductDraft(db, productId);
  if (!d) return null;
  const file = db.prepare("SELECT file_name FROM product_images WHERE id = ?");
  return {
    savedAt: d.savedAt,
    savedBy: d.savedBy,
    name: d.name,
    summary: d.summary,
    description: d.description,
    seoTitle: d.seoTitle,
    seoDescription: d.seoDescription,
    videos: (d.videos ?? []).map((v) => ({ title: v.title, url: v.url, platform: v.platform })),
    images: d.images
      .map((i) => ({ f: (file.get(i.imageId) as { file_name: string } | undefined)?.file_name, alt: i.alt }))
      .filter((i): i is { f: string; alt: string } => !!i.f)
      .map((i) => ({ url: `/anh/${i.f}`, alt: i.alt })),
  };
}

/** Áp dụng (giữ nguyên Ẩn/Hiện) hoặc bỏ bản nháp bài sản phẩm. */
export function resolveProductDraft(productId: string, apply: boolean): { ok: boolean; message: string } {
  try {
    return withTransaction((tx) => {
      const draft = readProductDraft(tx, productId);
      if (!draft) return { ok: false, message: "Sản phẩm không có bản nháp." };
      if (apply) {
        applyProductDraft(tx, productId, draft, { setVisible: false });
        return { ok: true, message: "Đã áp dụng bản nháp. Trạng thái Ẩn/Hiện giữ nguyên." };
      }
      tx.prepare("UPDATE products SET content_draft_json = NULL, updated_at = ? WHERE id = ?").run(nowIso(), productId);
      return { ok: true, message: "Đã bỏ bản nháp." };
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Không áp dụng được bản nháp." };
  }
}
