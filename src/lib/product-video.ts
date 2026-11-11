/**
 * Video sản phẩm (YouTube/TikTok): phân tích link, dựng địa chỉ nhúng chính thức. Dùng chung cho máy chủ và trình duyệt;
 * máy chủ luôn phân tích lại link khi lưu — KHÔNG nhận mã HTML/iframe/script do người dùng dán.
 *
 * Cách nhúng theo tài liệu chính thức (kiểm tra 10/11/2026):
 * - YouTube: https://www.youtube-nocookie.com/embed/{id} (chế độ bảo mật nâng cao). YouTube yêu cầu trình nhúng gửi
 *   Referer (thiếu sẽ báo lỗi 153) → iframe dùng referrerPolicy="strict-origin-when-cross-origin".
 * - TikTok: Embed Player https://www.tiktok.com/player/v1/{id} (cách “Embed Videos” cũ sắp ngừng).
 */

export type VideoPlatform = "youtube" | "tiktok";
export type VideoOrientation = "landscape" | "portrait";

/** Video hiển thị ở trang sản phẩm (dữ liệu đã kiểm tra ở máy chủ). */
export type ProductVideo = {
  platform: VideoPlatform;
  videoId: string;
  title: string;
  orientation: VideoOrientation;
  /** Link gốc để khách “Mở video gốc”. */
  sourceUrl: string;
  /** Ảnh bìa đã lưu trên máy chủ (/anh/…), null = dùng khung mặc định. */
  coverUrl: string | null;
};

export const MAX_VIDEOS_PER_PRODUCT = 10;
export const VIDEO_TITLE_MAX = 100;
export const VIDEO_URL_MAX = 500;

export type ParsedVideoUrl = {
  platform: VideoPlatform;
  videoId: string;
  /** Link chuẩn hoá để lưu và mở video gốc. */
  sourceUrl: string;
  /** Hướng mặc định suy từ loại link (Shorts/TikTok = dọc). */
  orientation: VideoOrientation;
};

export type ParseVideoResult =
  | { ok: true; video: ParsedVideoUrl }
  /** Link rút gọn TikTok (vm./vt.) — máy chủ cần tra oEmbed để lấy link đầy đủ. */
  | { ok: false; shortTikTok: true; url: string }
  | { ok: false; shortTikTok?: false; message: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const TT_ID = /^\d{15,22}$/;
const TT_USER = /^@[A-Za-z0-9_.]{1,40}$/;
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const TT_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const TT_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

export function parseVideoUrl(raw: unknown): ParseVideoResult {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input) return { ok: false, message: "Vui lòng dán link video." };
  if (input.length > VIDEO_URL_MAX) return { ok: false, message: `Link tối đa ${VIDEO_URL_MAX} ký tự.` };
  // Chỉ nhận MỘT đường link: chặn mã nhúng (<iframe…>, <script…>), khoảng trắng, dấu ngoặc.
  if (/[<>"'\s]/.test(input)) return { ok: false, message: "Chỉ dán link video YouTube hoặc TikTok, không dán mã nhúng (iframe/HTML)." };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, message: "Link không hợp lệ." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, message: "Link phải bắt đầu bằng https://." };
  if (u.username || u.password || u.port) return { ok: false, message: "Link không hợp lệ." };
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = parts[0] ?? "";
    if (parts.length === 1 && YT_ID.test(id)) return ok("youtube", id, `https://www.youtube.com/watch?v=${id}`, "landscape");
    return { ok: false, message: "Không đọc được mã video YouTube trong link." };
  }
  if (YT_HOSTS.has(host)) {
    if (parts[0] === "watch" && parts.length === 1) {
      const id = u.searchParams.get("v") ?? "";
      if (YT_ID.test(id)) return ok("youtube", id, `https://www.youtube.com/watch?v=${id}`, "landscape");
    }
    if (parts[0] === "shorts" && parts.length === 2 && YT_ID.test(parts[1]))
      return ok("youtube", parts[1], `https://www.youtube.com/shorts/${parts[1]}`, "portrait");
    if ((parts[0] === "embed" || parts[0] === "live") && parts.length === 2 && YT_ID.test(parts[1]))
      return ok("youtube", parts[1], `https://www.youtube.com/watch?v=${parts[1]}`, "landscape");
    return { ok: false, message: "Link YouTube cần có dạng youtube.com/watch?v=…, youtu.be/… hoặc youtube.com/shorts/…" };
  }
  if (TT_SHORT_HOSTS.has(host)) {
    if (parts.length === 1 && /^[A-Za-z0-9]{5,20}$/.test(parts[0])) return { ok: false, shortTikTok: true, url: `https://${host}/${parts[0]}/` };
    return { ok: false, message: "Link TikTok rút gọn không hợp lệ." };
  }
  if (TT_HOSTS.has(host)) {
    // https://www.tiktok.com/@user/video/123…
    if (parts.length === 3 && TT_USER.test(parts[0]) && parts[1] === "video" && TT_ID.test(parts[2]))
      return ok("tiktok", parts[2], `https://www.tiktok.com/${parts[0]}/video/${parts[2]}`, "portrait");
    // Link nhúng/di động: https://www.tiktok.com/player/v1/123, /embed/v2/123, m.tiktok.com/v/123.html
    const id =
      parts[0] === "player" && parts[1] === "v1"
        ? parts[2]
        : parts[0] === "embed" && parts[1] === "v2"
          ? parts[2]
          : parts[0] === "v"
            ? (parts[1] ?? "").replace(/\.html$/, "")
            : "";
    if (id && TT_ID.test(id) && parts.length <= 3) return ok("tiktok", id, `https://www.tiktok.com/player/v1/${id}`, "portrait");
    return { ok: false, message: "Link TikTok cần có dạng tiktok.com/@tên-tài-khoản/video/…" };
  }
  return { ok: false, message: "Chỉ hỗ trợ video YouTube hoặc TikTok." };
}

function ok(platform: VideoPlatform, videoId: string, sourceUrl: string, orientation: VideoOrientation): ParseVideoResult {
  return { ok: true, video: { platform, videoId, sourceUrl, orientation } };
}

/**
 * Ảnh khung hình do YouTube cung cấp (480×360, luôn có với video công khai), tải thẳng từ YouTube về trình duyệt khách.
 * Dùng khi máy chủ chưa lưu được ảnh bìa — để thẻ video không bị đen.
 */
export function youtubeThumbUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Địa chỉ trình phát chính thức. Chỉ dùng sau khi khách bấm xem (không tự phát khi mở trang). */
export function embedUrl(platform: VideoPlatform, videoId: string): string {
  if (platform === "youtube") {
    const p = new URLSearchParams({ autoplay: "1", playsinline: "1", rel: "0" });
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?${p}`;
  }
  const p = new URLSearchParams({ autoplay: "1", rel: "0", description: "0", music_info: "0" });
  return `https://www.tiktok.com/player/v1/${encodeURIComponent(videoId)}?${p}`;
}

export const platformLabel = (p: VideoPlatform) => (p === "youtube" ? "YouTube" : "TikTok");
