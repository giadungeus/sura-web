/**
 * Đọc/ghi cài đặt website, trang nội dung và tin tức (bảng site_settings, content_pages, news_posts).
 * Đọc lúc có yêu cầu (connection) nên sửa trong quản trị là website cập nhật ngay, không cần build lại.
 */
import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { getDb, withTransaction } from "@/lib/server/db";
import { IMAGE_FILE_PATTERN } from "@/lib/server/images";
import {
  CONTENT_BODY_MAX,
  CONTENT_PAGES,
  CONTENT_TITLE_MAX,
  buildNavLinks,
  hiddenPagePaths,
  pageBySlug,
} from "@/lib/content/pages";
import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  contentVariables,
  toPublicSettings,
  validateSettings,
  type PublicSettings,
  type SettingErrors,
  type SiteSettings,
} from "@/lib/content/settings";
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from "@/lib/slug";
import { syncNewsPublic, syncPagePublic } from "@/lib/server/public-state";
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, normalizeSeoText } from "@/lib/seo-text";

/** Hai ô SEO (chuỗi rỗng = dùng mặc định). */
export type SeoFields = { seoTitle: string; seoDescription: string };
function readSeoInput(input: Record<string, unknown>, fieldErrors: Record<string, string>): SeoFields {
  const seoTitle = normalizeSeoText(input.seoTitle);
  const seoDescription = normalizeSeoText(input.seoDescription);
  if (seoTitle.length > SEO_TITLE_MAX) fieldErrors.seoTitle = `Tiêu đề SEO tối đa ${SEO_TITLE_MAX} ký tự.`;
  if (seoDescription.length > SEO_DESCRIPTION_MAX) fieldErrors.seoDescription = `Mô tả SEO tối đa ${SEO_DESCRIPTION_MAX} ký tự.`;
  return { seoTitle, seoDescription };
}
const nullIfEmpty = (v: string | undefined | null) => (v ? v : null);
function parseSeoJson(json: string | null): Partial<SeoFields> | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Partial<SeoFields>;
  } catch {
    return null;
  }
}

const nowIso = () => new Date().toISOString();

const cleanTitle = (v: unknown) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
/** Giữ xuống dòng; bỏ ký tự điều khiển khác. */
const cleanBody = (v: unknown) =>
  typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim() : "";

// ═════════════════════ Cài đặt website ═════════════════════

function readSettings(): SiteSettings {
  const rows = getDb().prepare("SELECT key, value FROM site_settings").all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(SETTING_KEYS.map((k) => [k, map.get(k) ?? DEFAULT_SETTINGS[k]])) as SiteSettings;
}

/** Cài đặt cho trang công khai (một lần mỗi yêu cầu). */
export const getSiteSettings = cache(async (): Promise<PublicSettings> => {
  await connection();
  return toPublicSettings(readSettings());
});

const getPublicSlugs = cache(async (): Promise<Set<string>> => {
  await connection();
  const rows = getDb().prepare("SELECT slug FROM content_pages WHERE is_public = 1").all() as { slug: string }[];
  return new Set(rows.map((r) => r.slug));
});

/** Thông tin chung cho khung trang: cài đặt, liên kết menu/footer, biến nội dung. */
export const getSiteChrome = cache(async () => {
  const [settings, publicSlugs] = await Promise.all([getSiteSettings(), getPublicSlugs()]);
  return {
    settings,
    nav: buildNavLinks(publicSlugs, settings.brandName),
    vars: contentVariables(settings),
    hiddenPaths: hiddenPagePaths(publicSlugs),
  };
});

/** Biến và trang ẩn cho phần Xem trước trong quản trị (đã requireAdmin). */
export function getPreviewContext(): { vars: Record<string, string>; hiddenPaths: string[] } {
  const rows = getDb().prepare("SELECT slug FROM content_pages WHERE is_public = 1").all() as { slug: string }[];
  return {
    vars: contentVariables(toPublicSettings(readSettings())),
    hiddenPaths: hiddenPagePaths(new Set(rows.map((r) => r.slug))),
  };
}

export type SettingsMeta = { updatedAt: string | null; updatedBy: string | null };

/** Dùng trong trang quản trị (đã requireAdmin). */
export function getSettingsForAdmin(): { values: SiteSettings; meta: SettingsMeta } {
  const meta = getDb()
    .prepare(
      `SELECT updated_at, updated_by FROM site_settings WHERE key IN (${SETTING_KEYS.map(() => "?").join(", ")})
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(...SETTING_KEYS) as { updated_at: string; updated_by: string | null } | undefined;
  return { values: readSettings(), meta: { updatedAt: meta?.updated_at ?? null, updatedBy: meta?.updated_by ?? null } };
}

export function saveSiteSettings(
  input: Record<string, unknown>,
  username: string,
): { ok: true } | { ok: false; errors: SettingErrors } {
  const result = validateSettings(input);
  if (!result.ok) return result;
  const value = result.value;
  withTransaction((db) => {
    const now = nowIso();
    const upsert = db.prepare(
      `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by
       WHERE site_settings.value IS NOT excluded.value`,
    );
    for (const k of SETTING_KEYS) upsert.run(k, value[k], now, username);
  });
  return { ok: true };
}

// ═════════════════════ Trang nội dung ═════════════════════

type PageRow = {
  slug: string;
  title: string;
  body: string;
  draft_title: string | null;
  draft_body: string | null;
  draft_seo_json: string | null;
  seo_title: string | null;
  seo_description: string | null;
  public_updated_at: string | null;
  is_public: number;
  published_at: string | null;
  updated_at: string;
  updated_by: string | null;
};

/** Trang công khai; undefined nếu trang không tồn tại hoặc đang là nháp. */
export type PublicContentPage = { title: string; body: string; seoTitle: string | null; seoDescription: string | null; publicUpdatedAt: string | null };

export async function getPublicContentPage(slug: string): Promise<PublicContentPage | undefined> {
  await connection();
  if (!pageBySlug(slug)) return undefined;
  const row = getDb()
    .prepare("SELECT title, body, seo_title, seo_description, public_updated_at FROM content_pages WHERE slug = ? AND is_public = 1")
    .get(slug) as { title: string; body: string; seo_title: string | null; seo_description: string | null; public_updated_at: string | null } | undefined;
  return row && { title: row.title, body: row.body, seoTitle: row.seo_title, seoDescription: row.seo_description, publicUpdatedAt: row.public_updated_at };
}

/** Các trang nội dung đang công khai (cho sitemap). */
export async function listPublicContentPages(): Promise<{ slug: string; path: string; publicUpdatedAt: string | null }[]> {
  await connection();
  const rows = getDb().prepare("SELECT slug, public_updated_at FROM content_pages WHERE is_public = 1").all() as {
    slug: string;
    public_updated_at: string | null;
  }[];
  return rows.flatMap((r) => {
    const def = pageBySlug(r.slug);
    return def ? [{ slug: r.slug, path: def.path, publicUpdatedAt: r.public_updated_at }] : [];
  });
}

export type AdminPageSummary = {
  slug: string;
  label: string;
  path: string;
  title: string;
  isPublic: boolean;
  hasDraft: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export function listPagesForAdmin(): AdminPageSummary[] {
  const rows = getDb().prepare("SELECT * FROM content_pages").all() as PageRow[];
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return CONTENT_PAGES.map((def) => {
    const r = bySlug.get(def.slug);
    return {
      slug: def.slug,
      label: def.label,
      path: def.path,
      title: r?.draft_title ?? r?.title ?? def.label,
      isPublic: r?.is_public === 1,
      hasDraft: r ? r.draft_body !== null : false,
      publishedAt: r?.published_at ?? null,
      updatedAt: r?.updated_at ?? null,
      updatedBy: r?.updated_by ?? null,
    };
  });
}

export type AdminPage = AdminPageSummary & { editTitle: string; editBody: string; editSeo: SeoFields; liveTitle: string; liveBody: string };

export function getPageForAdmin(slug: string): AdminPage | undefined {
  const def = pageBySlug(slug);
  if (!def) return undefined;
  const r = getDb().prepare("SELECT * FROM content_pages WHERE slug = ?").get(slug) as PageRow | undefined;
  const summary = listPagesForAdmin().find((p) => p.slug === slug)!;
  return {
    ...summary,
    // Đang có nháp thì mở nháp để sửa tiếp; không thì mở bản hiện tại.
    editTitle: r?.draft_title ?? r?.title ?? def.label,
    editBody: r?.draft_body ?? r?.body ?? "",
    editSeo: {
      seoTitle: parseSeoJson(r?.draft_seo_json ?? null)?.seoTitle ?? r?.seo_title ?? "",
      seoDescription: parseSeoJson(r?.draft_seo_json ?? null)?.seoDescription ?? r?.seo_description ?? "",
    },
    liveTitle: r?.title ?? def.label,
    liveBody: r?.body ?? "",
  };
}

export type ContentIntent = "draft" | "publish" | "unpublish" | "discard";
export type ContentResult = { ok: true; message: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

/**
 * - draft: trang đang công khai → lưu vào bản nháp (khách vẫn thấy bản cũ); trang đang nháp → lưu thẳng.
 * - publish: nội dung đang sửa thành bản công khai, xoá nháp.
 * - unpublish: chuyển về Nháp (ẩn khỏi website), giữ nguyên nội dung.
 * - discard: bỏ bản nháp chưa công khai.
 */
export function saveContentPage(
  slug: string,
  input: { title: unknown; body: unknown; seoTitle?: unknown; seoDescription?: unknown },
  intent: ContentIntent,
  username: string,
): ContentResult {
  const def = pageBySlug(slug);
  if (!def) return { ok: false, message: "Không tìm thấy trang." };
  const now = nowIso();

  if (intent === "unpublish" || intent === "discard") {
    const sql =
      intent === "unpublish"
        ? "UPDATE content_pages SET is_public = 0, updated_at = ?, updated_by = ? WHERE slug = ?"
        : "UPDATE content_pages SET draft_title = NULL, draft_body = NULL, draft_seo_json = NULL, updated_at = ?, updated_by = ? WHERE slug = ?";
    withTransaction((db) => {
      db.prepare(sql).run(now, username, slug);
      syncPagePublic(db, slug, now);
    });
    return { ok: true, message: intent === "unpublish" ? "Đã chuyển trang về Nháp. Khách không còn xem được trang này." : "Đã bỏ bản nháp." };
  }

  const title = cleanTitle(input.title);
  const body = cleanBody(input.body);
  const fieldErrors: Record<string, string> = {};
  const seo = readSeoInput(input as Record<string, unknown>, fieldErrors);
  if (!title) fieldErrors.title = "Vui lòng nhập tiêu đề.";
  else if (title.length > CONTENT_TITLE_MAX) fieldErrors.title = `Tiêu đề tối đa ${CONTENT_TITLE_MAX} ký tự.`;
  if (body.length > CONTENT_BODY_MAX) fieldErrors.body = `Nội dung tối đa ${CONTENT_BODY_MAX.toLocaleString("vi-VN")} ký tự.`;
  if (intent === "publish" && !body) fieldErrors.body = "Nội dung trống, chưa thể công khai.";
  if (Object.keys(fieldErrors).length) return { ok: false, message: "Vui lòng kiểm tra lại.", fieldErrors };

  return withTransaction((db) => {
    const row = db.prepare("SELECT is_public FROM content_pages WHERE slug = ?").get(slug) as { is_public: number } | undefined;
    if (!row) {
      db.prepare(
        `INSERT INTO content_pages (slug, title, body, seo_title, seo_description, is_public, published_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(slug, title, body, nullIfEmpty(seo.seoTitle), nullIfEmpty(seo.seoDescription), intent === "publish" ? 1 : 0, intent === "publish" ? now : null, now, username);
    } else if (intent === "publish") {
      db.prepare(
        `UPDATE content_pages SET title = ?, body = ?, seo_title = ?, seo_description = ?, draft_title = NULL, draft_body = NULL,
           draft_seo_json = NULL, is_public = 1, published_at = ?, updated_at = ?, updated_by = ? WHERE slug = ?`,
      ).run(title, body, nullIfEmpty(seo.seoTitle), nullIfEmpty(seo.seoDescription), now, now, username, slug);
    } else if (row.is_public === 1) {
      // Bản nháp của trang đang công khai: SEO đi cùng bản nháp, không đổi metadata đang công khai.
      db.prepare(
        "UPDATE content_pages SET draft_title = ?, draft_body = ?, draft_seo_json = ?, updated_at = ?, updated_by = ? WHERE slug = ?",
      ).run(title, body, JSON.stringify(seo), now, username, slug);
    } else {
      db.prepare(
        `UPDATE content_pages SET title = ?, body = ?, seo_title = ?, seo_description = ?, draft_title = NULL, draft_body = NULL,
           draft_seo_json = NULL, updated_at = ?, updated_by = ? WHERE slug = ?`,
      ).run(title, body, nullIfEmpty(seo.seoTitle), nullIfEmpty(seo.seoDescription), now, username, slug);
    }
    syncPagePublic(db, slug, now);
    return {
      ok: true as const,
      message:
        intent === "publish"
          ? "Đã công khai. Khách đang thấy nội dung mới."
          : row?.is_public === 1
            ? "Đã lưu nháp. Khách vẫn thấy bản đang công khai cho tới khi bạn bấm Công khai."
            : "Đã lưu nháp. Trang chưa hiển thị trên website.",
    };
  });
}

// ═════════════════════ Tin tức ═════════════════════

export const NEWS_SUMMARY_MAX = 300;

type NewsRow = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  body: string;
  cover_file: string | null;
  cover_alt: string | null;
  draft_json: string | null;
  seo_title: string | null;
  seo_description: string | null;
  public_updated_at: string | null;
  is_public: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type NewsFields = {
  title: string;
  slug: string;
  summary: string;
  body: string;
  coverFile: string | null;
  coverAlt?: string;
  /** Chuỗi rỗng = dùng mặc định. Bản nháp cũ (trước v8) không có → lấy giá trị đang lưu. */
  seoTitle?: string;
  seoDescription?: string;
};

export type PublicNews = NewsFields & { publishedAt: string; publicUpdatedAt: string | null };

const toPublic = (r: NewsRow): PublicNews => ({
  title: r.title,
  slug: r.slug,
  summary: r.summary,
  body: r.body,
  coverFile: r.cover_file,
  coverAlt: r.cover_alt ?? "",
  seoTitle: r.seo_title ?? "",
  seoDescription: r.seo_description ?? "",
  publishedAt: r.published_at!,
  publicUpdatedAt: r.public_updated_at,
});

const coverUrl = (file: string | null) => (file ? `/anh/${file}` : null);
export { coverUrl as newsCoverUrl };

export async function getPublicNews(): Promise<PublicNews[]> {
  await connection();
  const rows = getDb()
    .prepare("SELECT * FROM news_posts WHERE is_public = 1 ORDER BY published_at DESC, id DESC")
    .all() as NewsRow[];
  return rows.map(toPublic);
}

export async function getPublicNewsPost(slug: string): Promise<PublicNews | undefined> {
  await connection();
  const r = getDb().prepare("SELECT * FROM news_posts WHERE slug = ? AND is_public = 1").get(slug) as NewsRow | undefined;
  return r && toPublic(r);
}

export type NewsStatus = "draft" | "public" | "hidden";
export type AdminNews = {
  id: number;
  status: NewsStatus;
  hasDraft: boolean;
  edit: NewsFields;
  slugLocked: boolean;
  liveSlug: string;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
};

const statusOf = (r: NewsRow): NewsStatus => (r.is_public ? "public" : r.published_at ? "hidden" : "draft");

function toAdmin(r: NewsRow): AdminNews {
  let draft: NewsFields | null = null;
  if (r.draft_json) {
    try {
      draft = JSON.parse(r.draft_json) as NewsFields;
    } catch {}
  }
  const liveSeo = { seoTitle: r.seo_title ?? "", seoDescription: r.seo_description ?? "" };
  return {
    id: r.id,
    status: statusOf(r),
    hasDraft: draft !== null,
    edit: draft
      ? { ...liveSeo, ...draft }
      : { title: r.title, slug: r.slug, summary: r.summary, body: r.body, coverFile: r.cover_file, coverAlt: r.cover_alt ?? "", ...liveSeo },
    /** Từng công khai → khoá slug. */
    slugLocked: r.published_at !== null,
    liveSlug: r.slug,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  };
}

export function listNewsForAdmin(): AdminNews[] {
  return (getDb().prepare("SELECT * FROM news_posts ORDER BY updated_at DESC, id DESC").all() as NewsRow[]).map(toAdmin);
}

export function getNewsForAdmin(id: number): AdminNews | undefined {
  const r = getDb().prepare("SELECT * FROM news_posts WHERE id = ?").get(id) as NewsRow | undefined;
  return r && toAdmin(r);
}

export type NewsIntent = "draft" | "publish" | "hide" | "discard";
export type NewsResult = { ok: true; id: number; message: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

function validateNews(input: Record<string, unknown>): { ok: true; value: NewsFields } | { ok: false; fieldErrors: Record<string, string> } {
  const title = cleanTitle(input.title);
  const slug = cleanTitle(input.slug).toLowerCase();
  const summary = cleanTitle(input.summary);
  const body = cleanBody(input.body);
  const coverRaw = cleanTitle(input.coverFile);
  const coverAlt = cleanTitle(input.coverAlt);
  const fieldErrors: Record<string, string> = {};
  const seo = readSeoInput(input, fieldErrors);
  if (!title) fieldErrors.title = "Vui lòng nhập tiêu đề.";
  else if (title.length > CONTENT_TITLE_MAX) fieldErrors.title = `Tiêu đề tối đa ${CONTENT_TITLE_MAX} ký tự.`;
  if (!slug) fieldErrors.slug = "Vui lòng nhập slug.";
  else if (slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(slug))
    fieldErrors.slug = "Slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang.";
  if (summary.length > NEWS_SUMMARY_MAX) fieldErrors.summary = `Mô tả ngắn tối đa ${NEWS_SUMMARY_MAX} ký tự.`;
  if (body.length > CONTENT_BODY_MAX) fieldErrors.body = "Nội dung quá dài.";
  let coverFile: string | null = null;
  if (coverRaw) {
    // Ảnh bìa: ảnh tải lên trong trình sửa (product_images) hoặc ảnh từ gói nội dung (content_images).
    const known =
      IMAGE_FILE_PATTERN.test(coverRaw) &&
      getDb().prepare("SELECT 1 FROM product_images WHERE file_name = ? UNION ALL SELECT 1 FROM content_images WHERE file_name = ?").get(coverRaw, coverRaw);
    if (!known) fieldErrors.coverFile = "Ảnh đại diện không hợp lệ. Hãy tải ảnh lên lại.";
    else coverFile = coverRaw;
  }
  if (coverAlt.length > 200) fieldErrors.coverAlt = "Mô tả ảnh tối đa 200 ký tự.";
  return Object.keys(fieldErrors).length
    ? { ok: false, fieldErrors }
    : { ok: true, value: { title, slug, summary, body, coverFile, coverAlt: coverFile ? coverAlt : "", ...seo } };
}

export function saveNews(id: number | null, input: Record<string, unknown>, intent: NewsIntent, username: string): NewsResult {
  const now = nowIso();
  if (intent === "hide" || intent === "discard") {
    if (!id) return { ok: false, message: "Không tìm thấy bài viết." };
    const sql =
      intent === "hide"
        ? "UPDATE news_posts SET is_public = 0, updated_at = ?, updated_by = ? WHERE id = ?"
        : "UPDATE news_posts SET draft_json = NULL, updated_at = ?, updated_by = ? WHERE id = ?";
    const r = withTransaction((db) => {
      const res = db.prepare(sql).run(now, username, id);
      if (res.changes) syncNewsPublic(db, id, now);
      return res;
    });
    if (!r.changes) return { ok: false, message: "Không tìm thấy bài viết." };
    return { ok: true, id, message: intent === "hide" ? "Đã ẩn bài viết khỏi website." : "Đã bỏ bản nháp." };
  }

  const v = validateNews(input);
  if (!v.ok) return { ok: false, message: "Vui lòng kiểm tra lại.", fieldErrors: v.fieldErrors };
  const f = v.value;
  if (intent === "publish" && !f.body) return { ok: false, message: "Vui lòng kiểm tra lại.", fieldErrors: { body: "Nội dung trống, chưa thể công khai." } };

  return withTransaction((db) => {
    const taken = db.prepare("SELECT id FROM news_posts WHERE slug = ? AND id IS NOT ?").get(f.slug, id) as { id: number } | undefined;
    if (taken) return { ok: false as const, message: "Vui lòng kiểm tra lại.", fieldErrors: { slug: "Slug đã được dùng cho bài khác." } };

    if (!id) {
      const r = db
        .prepare(
          `INSERT INTO news_posts (slug, title, summary, body, cover_file, cover_alt, is_public, published_at, created_at, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(f.slug, f.title, f.summary, f.body, f.coverFile, f.coverAlt || null, intent === "publish" ? 1 : 0, intent === "publish" ? now : null, now, now, username);
      const newId = Number(r.lastInsertRowid);
      db.prepare("UPDATE news_posts SET seo_title = ?, seo_description = ? WHERE id = ?").run(nullIfEmpty(f.seoTitle), nullIfEmpty(f.seoDescription), newId);
      syncNewsPublic(db, newId, now);
      return { ok: true as const, id: newId, message: intent === "publish" ? "Đã công khai bài viết." : "Đã lưu nháp." };
    }
    const row = db.prepare("SELECT * FROM news_posts WHERE id = ?").get(id) as NewsRow | undefined;
    if (!row) return { ok: false as const, message: "Không tìm thấy bài viết." };
    if (row.published_at !== null && f.slug !== row.slug)
      return { ok: false as const, message: "Vui lòng kiểm tra lại.", fieldErrors: { slug: "Slug đã khoá vì bài từng công khai (đổi sẽ làm hỏng đường dẫn cũ)." } };
    const seoSql = "UPDATE news_posts SET seo_title = ?, seo_description = ? WHERE id = ?";

    if (intent === "publish") {
      db.prepare(
        `UPDATE news_posts SET slug = ?, title = ?, summary = ?, body = ?, cover_file = ?, cover_alt = ?, draft_json = NULL, is_public = 1,
           published_at = COALESCE(published_at, ?), updated_at = ?, updated_by = ? WHERE id = ?`,
      ).run(f.slug, f.title, f.summary, f.body, f.coverFile, f.coverAlt || null, now, now, username, id);
      db.prepare(seoSql).run(nullIfEmpty(f.seoTitle), nullIfEmpty(f.seoDescription), id);
      syncNewsPublic(db, id, now);
      return { ok: true as const, id, message: "Đã công khai. Khách đang thấy nội dung mới." };
    }
    if (row.is_public) {
      db.prepare("UPDATE news_posts SET draft_json = ?, updated_at = ?, updated_by = ? WHERE id = ?").run(JSON.stringify(f), now, username, id);
      return { ok: true as const, id, message: "Đã lưu nháp. Khách vẫn thấy bản đang công khai cho tới khi bạn bấm Công khai." };
    }
    db.prepare(
      `UPDATE news_posts SET slug = ?, title = ?, summary = ?, body = ?, cover_file = ?, cover_alt = ?, draft_json = NULL,
         updated_at = ?, updated_by = ? WHERE id = ?`,
    ).run(f.slug, f.title, f.summary, f.body, f.coverFile, f.coverAlt || null, now, username, id);
    db.prepare(seoSql).run(nullIfEmpty(f.seoTitle), nullIfEmpty(f.seoDescription), id);
    syncNewsPublic(db, id, now);
    return { ok: true as const, id, message: "Đã lưu nháp. Bài chưa hiển thị trên website." };
  });
}
