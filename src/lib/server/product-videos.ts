import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "@/lib/server/db";
import { IMAGE_FILE_PATTERN, MAX_UPLOAD_BYTES, getUploadDir, processImageBuffer } from "@/lib/server/images";
import { fetchImageFromUrl } from "@/lib/server/import/fetch-image";
import {
  MAX_VIDEOS_PER_PRODUCT,
  VIDEO_TITLE_MAX,
  parseVideoUrl,
  youtubeThumbUrl,
  type ParsedVideoUrl,
  type ProductVideo,
  type VideoOrientation,
} from "@/lib/product-video";

/**
 * Video sản phẩm ở máy chủ: kiểm tra link, lấy ảnh bìa từ nền tảng (tải ẢNH qua bộ tải an toàn, lưu WebP như ảnh sản phẩm),
 * kiểm tra lại toàn bộ khi lưu, ghi/xoá trong giao dịch của sản phẩm. Không tải tệp video về máy chủ.
 */

const imageUrl = (fileName: string) => `/anh/${fileName}`;

export type AdminVideo = {
  id: number | null;
  url: string;
  title: string;
  orientation: VideoOrientation;
  platform: ParsedVideoUrl["platform"];
  videoId: string;
  coverFile: string | null;
  coverUrl: string | null;
  coverSource: "none" | "platform" | "upload";
};

export type InspectResult =
  | { ok: true; video: AdminVideo; coverMessage: string | null }
  | { ok: false; message: string };

type OEmbed = { thumbnail_url?: unknown; embed_product_id?: unknown; author_unique_id?: unknown; author_url?: unknown };

/** oEmbed TikTok (máy chủ cố định www.tiktok.com, có giới hạn thời gian). null nếu không lấy được. */
async function tiktokOEmbed(url: string): Promise<OEmbed | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 200_000) return null;
    const data = JSON.parse(text) as unknown;
    return data && typeof data === "object" ? (data as OEmbed) : null;
  } catch {
    return null;
  }
}

const TIKTOK_PAGE_MAX = 3_000_000;
const TIKTOK_CDN = /^https:\/\/[a-z0-9.-]+\.(tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com)\//i;

/**
 * Ảnh bìa TikTok: oEmbed không có thumbnail_url, nên đọc trang công khai của video (máy chủ cố định www.tiktok.com)
 * và lấy `video.originCover`/`video.cover` trong dữ liệu trang. Chỉ nhận link ảnh thuộc máy chủ ảnh của TikTok.
 * null nếu TikTok không trả dữ liệu (vd. chặn truy cập tự động) → quản trị tải ảnh bìa lên.
 */
async function tiktokPageCover(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/@/video/${videoId}`, {
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (html.length > TIKTOK_PAGE_MAX) return null;
    const m = html.match(/<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    const data = JSON.parse(m[1]) as {
      __DEFAULT_SCOPE__?: { "webapp.video-detail"?: { itemInfo?: { itemStruct?: { id?: unknown; video?: Record<string, unknown> } } } };
    };
    const item = data.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
    if (!item || item.id !== videoId) return null;
    for (const key of ["originCover", "cover", "dynamicCover"]) {
      const url = item.video?.[key];
      if (typeof url === "string" && TIKTOK_CDN.test(url)) return url;
    }
    return null;
  } catch {
    return null;
  }
}

/** Ảnh YouTube từ lớn đến nhỏ: maxres/sd không phải video nào cũng có (trả 404) → thử bản nhỏ hơn. */
const YOUTUBE_THUMBS = ["maxresdefault", "sddefault", "hqdefault", "mqdefault", "default"];

const YOUTUBE_THUMB = /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/[a-z]+\.jpg$/;
/** Ảnh nền tảng tải bằng fetch: chỉ máy chủ ảnh cố định của YouTube/TikTok (không phải địa chỉ tuỳ ý → không có nguy cơ SSRF). */
const isPlatformImage = (src: string) => YOUTUBE_THUMB.test(src) || TIKTOK_CDN.test(src);

/**
 * Tải ảnh bìa từ máy chủ ảnh YouTube/TikTok bằng fetch. Trong container Coolify, node:https bị treo khi kết nối
 * i.ytimg.com (không có đường IPv6) còn fetch kết nối được (đã kiểm chứng trong container: https.get hết thời gian chờ,
 * fetch trả 200). Giới hạn thời gian và dung lượng như bộ tải ảnh chung.
 */
async function fetchPlatformImage(src: string): Promise<Buffer> {
  if (!isPlatformImage(src)) throw new Error("Địa chỉ ảnh không thuộc YouTube/TikTok.");
  let res: Response;
  try {
    res = await fetch(src, { signal: AbortSignal.timeout(15_000), redirect: "error", headers: { Accept: "image/jpeg,image/*;q=0.8" } });
  } catch (e) {
    throw new Error(e instanceof Error && e.name === "TimeoutError" ? "Quá thời gian tải ảnh (15 giây)." : "Không kết nối được máy chủ ảnh.");
  }
  if (res.status !== 200) throw new Error(`Máy chủ ảnh trả về mã ${res.status}.`);
  if (!/^image\//i.test(res.headers.get("content-type") ?? "")) throw new Error("Không phải ảnh.");
  if (Number(res.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) throw new Error("Ảnh vượt quá 5 MB.");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_UPLOAD_BYTES) throw new Error("Ảnh vượt quá 5 MB.");
  return buf;
}

export type CoverResult = { fileName: string; reason: null } | { fileName: null; reason: string };

/**
 * Ảnh bìa từ nền tảng → lưu như ảnh sản phẩm (qua bộ tải ảnh an toàn). Không lấy được thì trả lý do cụ thể
 * để quản trị biết (vd. máy chủ không kết nối được i.ytimg.com) và có thể tải ảnh thay thế.
 */
export async function fetchPlatformCover(video: ParsedVideoUrl, oembed: OEmbed | null = null): Promise<CoverResult> {
  const sources: string[] = [];
  if (video.platform === "youtube") sources.push(...YOUTUBE_THUMBS.map((q) => `https://i.ytimg.com/vi/${video.videoId}/${q}.jpg`));
  else {
    const data = oembed ?? (await tiktokOEmbed(video.sourceUrl));
    const src =
      typeof data?.thumbnail_url === "string" && /^https:\/\//.test(data.thumbnail_url) ? data.thumbnail_url : await tiktokPageCover(video.videoId);
    if (src) sources.push(src);
    else return { fileName: null, reason: "TikTok không trả ảnh bìa cho máy chủ (có thể đang chặn truy cập tự động)." };
  }
  let reason = "không rõ lý do";
  for (const src of sources) {
    try {
      const processed = await processImageBuffer(isPlatformImage(src) ? await fetchPlatformImage(src) : await fetchImageFromUrl(src));
      return { fileName: processed.fileName, reason: null };
    } catch (e) {
      reason = e instanceof Error && e.message ? e.message : reason;
      // 404 (cỡ ảnh không có) → thử cỡ nhỏ hơn; lỗi khác (mạng, chặn) thì các cỡ khác cũng sẽ lỗi như vậy.
      if (!/mã 404/.test(reason)) break;
    }
  }
  return { fileName: null, reason };
}

const coverFailMessage = (platform: ParsedVideoUrl["platform"], reason: string) =>
  `Chưa lấy được ảnh bìa từ ${platform === "youtube" ? "YouTube" : "TikTok"} (${reason}) — bấm nút lấy ảnh bìa để thử lại hoặc tải ảnh bìa thay thế.`;

/** Lấy lại ảnh bìa cho video đã có (không đổi tiêu đề/thứ tự — chỉ trả tệp ảnh mới để form gắn vào). */
export async function refetchVideoCover(rawUrl: unknown): Promise<{ ok: true; fileName: string } | { ok: false; message: string }> {
  const parsed = parseVideoUrl(rawUrl);
  if (!parsed.ok) return { ok: false, message: parsed.shortTikTok ? "Link TikTok rút gọn — hãy dùng link đầy đủ." : parsed.message };
  const cover = await fetchPlatformCover(parsed.video);
  return cover.reason === null ? { ok: true, fileName: cover.fileName } : { ok: false, message: coverFailMessage(parsed.video.platform, cover.reason) };
}

/** Kiểm tra link khi quản trị bấm “Thêm video”: chuẩn hoá link, lấy ảnh bìa nếu được. */
export async function inspectVideoLink(raw: unknown): Promise<InspectResult> {
  let parsed = parseVideoUrl(raw);
  let oembed: OEmbed | null = null;
  if (!parsed.ok && parsed.shortTikTok) {
    // Link rút gọn vm./vt.tiktok.com: tra oEmbed để lấy tài khoản + mã video, dựng link đầy đủ.
    oembed = await tiktokOEmbed(parsed.url);
    const id = typeof oembed?.embed_product_id === "string" ? oembed.embed_product_id : "";
    const user = typeof oembed?.author_unique_id === "string" ? oembed.author_unique_id : "";
    parsed = id && user ? parseVideoUrl(`https://www.tiktok.com/@${user}/video/${id}`) : { ok: false, message: "" };
    if (!parsed.ok)
      return { ok: false, message: "Không đọc được link TikTok rút gọn. Hãy mở video trên TikTok và dán link đầy đủ dạng tiktok.com/@tên-tài-khoản/video/…" };
  }
  if (!parsed.ok) return { ok: false, message: parsed.shortTikTok ? "Link không hợp lệ." : parsed.message };
  const v = parsed.video;
  const cover = await fetchPlatformCover(v, oembed);
  const coverFile = cover.fileName;
  // Ghi lý do vào log máy chủ (Coolify → Logs) để chẩn đoán khi không lấy được ảnh bìa.
  if (cover.reason) console.warn(`[video] Không lấy được ảnh bìa ${v.platform} ${v.videoId}: ${cover.reason}`);
  return {
    ok: true,
    video: {
      id: null,
      url: v.sourceUrl,
      title: "",
      orientation: v.orientation,
      platform: v.platform,
      videoId: v.videoId,
      coverFile,
      coverUrl: coverFile ? imageUrl(coverFile) : null,
      coverSource: coverFile ? "platform" : "none",
    },
    coverMessage: cover.reason === null ? null : coverFailMessage(v.platform, cover.reason),
  };
}

// ───────────── Kiểm tra khi lưu ─────────────

export type ValidVideo = {
  id: number | null;
  platform: ParsedVideoUrl["platform"];
  videoId: string;
  sourceUrl: string;
  title: string;
  orientation: VideoOrientation;
  coverFile: string | null;
  coverSource: "none" | "platform" | "upload";
};

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : "";

/**
 * Kiểm tra danh sách video từ form. Máy chủ phân tích lại từng link (không tin dữ liệu nền tảng/mã video từ trình duyệt);
 * id phải thuộc chính sản phẩm; ảnh bìa phải là tệp ảnh do máy chủ tạo và còn trên đĩa.
 */
export function validateVideos(
  raw: unknown[],
  productId: string | null,
  db: DatabaseSync,
  errors: Record<string, string>,
): ValidVideo[] {
  if (raw.length > MAX_VIDEOS_PER_PRODUCT) {
    errors.videos = `Tối đa ${MAX_VIDEOS_PER_PRODUCT} video.`;
    return [];
  }
  const owned = new Set(
    productId === null
      ? []
      : (db.prepare("SELECT id FROM product_videos WHERE product_id = ?").all(productId) as { id: number }[]).map((r) => r.id),
  );
  const seen = new Set<string>();
  const out: ValidVideo[] = [];
  raw.forEach((rv, i) => {
    const v = (typeof rv === "object" && rv !== null ? rv : {}) as Record<string, unknown>;
    const key = `videos.${i}`;
    const idNum = typeof v.id === "number" && Number.isInteger(v.id) ? v.id : null;
    if (v.id !== null && v.id !== undefined && (idNum === null || !owned.has(idNum))) {
      errors[`${key}.url`] = `Video ${i + 1}: không thuộc sản phẩm này, vui lòng tải lại trang.`;
      return;
    }
    const parsed = parseVideoUrl(v.url);
    if (!parsed.ok) {
      errors[`${key}.url`] = `Video ${i + 1}: ${parsed.shortTikTok ? "hãy bấm “Thêm” để chuyển link rút gọn thành link đầy đủ." : parsed.message}`;
      return;
    }
    const p = parsed.video;
    const dupKey = `${p.platform}:${p.videoId}`;
    if (seen.has(dupKey)) errors[`${key}.url`] = `Video ${i + 1}: trùng với video khác của sản phẩm.`;
    seen.add(dupKey);
    const title = clean(v.title, VIDEO_TITLE_MAX);
    if (title.length < 2) errors[`${key}.title`] = `Video ${i + 1}: nhập tiêu đề (vd. “Hướng dẫn kết nối”).`;
    else if (title.length > VIDEO_TITLE_MAX) errors[`${key}.title`] = `Video ${i + 1}: tiêu đề tối đa ${VIDEO_TITLE_MAX} ký tự.`;
    const orientation: VideoOrientation = v.orientation === "portrait" ? "portrait" : v.orientation === "landscape" ? "landscape" : p.orientation;
    let coverFile: string | null = null;
    if (v.coverFile !== null && v.coverFile !== undefined && v.coverFile !== "") {
      const f = String(v.coverFile);
      if (!IMAGE_FILE_PATTERN.test(f) || !existsSync(path.join(/*turbopackIgnore: true*/ getUploadDir(), f)))
        errors[`${key}.cover`] = `Video ${i + 1}: ảnh bìa không còn hợp lệ, vui lòng chọn lại.`;
      else coverFile = f;
    }
    const coverSource = coverFile === null ? "none" : v.coverSource === "upload" ? "upload" : "platform";
    out.push({ id: idNum, platform: p.platform, videoId: p.videoId, sourceUrl: p.sourceUrl, title, orientation, coverFile, coverSource });
  });
  return out;
}

/**
 * Ghi video trong giao dịch của sản phẩm (thêm/sửa/xoá/sắp xếp). Trả về tệp ảnh bìa không còn dùng để xoá SAU khi
 * giao dịch thành công. Chỉ gọi khi form có gửi danh sách video — thao tác không gửi video thì video hiện có giữ nguyên.
 */
export function writeVideos(db: DatabaseSync, productId: string, videos: ValidVideo[], t: string): string[] {
  const current = db.prepare("SELECT id, cover_file FROM product_videos WHERE product_id = ?").all(productId) as {
    id: number;
    cover_file: string | null;
  }[];
  const keep = new Set(videos.filter((v) => v.id !== null).map((v) => v.id!));
  const oldCovers = new Set(current.map((c) => c.cover_file).filter((f): f is string => !!f));
  const del = db.prepare("DELETE FROM product_videos WHERE id = ? AND product_id = ?");
  for (const c of current) if (!keep.has(c.id)) del.run(c.id, productId);
  const update = db.prepare(
    `UPDATE product_videos SET position = ?, platform = ?, video_id = ?, source_url = ?, title = ?, orientation = ?,
            cover_file = ?, cover_source = ?, updated_at = ? WHERE id = ? AND product_id = ?`,
  );
  const insert = db.prepare(
    `INSERT INTO product_videos (product_id, position, platform, video_id, source_url, title, orientation, cover_file, cover_source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  videos.forEach((v, position) => {
    if (v.id !== null) update.run(position, v.platform, v.videoId, v.sourceUrl, v.title, v.orientation, v.coverFile, v.coverSource, t, v.id, productId);
    else insert.run(productId, position, v.platform, v.videoId, v.sourceUrl, v.title, v.orientation, v.coverFile, v.coverSource, t, t);
  });
  const stillUsed = db.prepare("SELECT 1 FROM product_videos WHERE cover_file = ? LIMIT 1");
  return [...oldCovers].filter((f) => !stillUsed.get(f));
}

/** Tệp ảnh bìa của sản phẩm (để xoá khỏi đĩa khi xoá hẳn sản phẩm). */
export function videoCoverFiles(db: DatabaseSync, productId: string): string[] {
  return (db.prepare("SELECT DISTINCT cover_file FROM product_videos WHERE product_id = ? AND cover_file IS NOT NULL").all(productId) as {
    cover_file: string;
  }[]).map((r) => r.cover_file);
}

type VideoRow = {
  id: number;
  platform: "youtube" | "tiktok";
  video_id: string;
  source_url: string;
  title: string;
  orientation: VideoOrientation;
  cover_file: string | null;
  cover_source: "none" | "platform" | "upload";
};

const rows = (db: DatabaseSync, productId: string) =>
  db
    .prepare(
      `SELECT id, platform, video_id, source_url, title, orientation, cover_file, cover_source FROM product_videos
       WHERE product_id = ? ORDER BY position, id`,
    )
    .all(productId) as VideoRow[];

export function getAdminVideos(productId: string, db: DatabaseSync = getDb()): AdminVideo[] {
  return rows(db, productId).map((r) => ({
    id: r.id,
    url: r.source_url,
    title: r.title,
    orientation: r.orientation,
    platform: r.platform,
    videoId: r.video_id,
    coverFile: r.cover_file,
    coverUrl: r.cover_file ? imageUrl(r.cover_file) : null,
    coverSource: r.cover_source,
  }));
}

export function getPublicVideos(productId: string, db: DatabaseSync = getDb()): ProductVideo[] {
  return rows(db, productId).map((r) => ({
    platform: r.platform,
    videoId: r.video_id,
    title: r.title,
    orientation: r.orientation,
    sourceUrl: r.source_url,
    // Chưa lưu được ảnh bìa: YouTube → ảnh khung hình tải thẳng từ YouTube (không để thẻ đen); TikTok → thẻ nút phát.
    coverUrl: r.cover_file ? imageUrl(r.cover_file) : r.platform === "youtube" ? youtubeThumbUrl(r.video_id) : null,
  }));
}
