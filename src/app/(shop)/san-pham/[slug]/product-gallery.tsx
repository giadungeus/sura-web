"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { ExternalLink, Loader2, Maximize2, Play, X } from "lucide-react";
import { embedUrl, platformLabel, type ProductVideo } from "@/lib/product-video";
import type { ProductPhoto } from "@/types";

type Selected = { kind: "image"; index: number } | { kind: "video"; index: number };
/** Thời gian chờ trình phát tải xong trước khi hiện hướng dẫn mở video gốc (không để khung chờ vô hạn). */
const LOAD_TIMEOUT_MS = 15_000;

/**
 * Khung ảnh/video trang sản phẩm.
 * - Mở trang: hiện ảnh đại diện. Không tải trình phát nào cho tới khi khách bấm một video (không tự phát).
 * - Khung lớn giữ tỷ lệ vuông cố định → chuyển ảnh/video không làm nhảy bố cục; video ngang/dọc giữ đúng tỷ lệ, không cắt.
 * - Chỉ MỘT trình phát tồn tại tại một thời điểm: chọn ảnh/video khác hoặc mở/đóng “Xem lớn” sẽ gỡ trình phát cũ (dừng phát).
 */
export function ProductGallery({
  photos,
  videos,
  name,
  placeholder,
}: {
  photos: ProductPhoto[];
  videos: ProductVideo[];
  name: string;
  /** Hiển thị khi sản phẩm chưa có ảnh. */
  placeholder?: ReactNode;
}) {
  const [selected, setSelected] = useState<Selected>({ kind: "image", index: 0 });
  /** Video đang phát trong khung lớn (chỉ sau khi khách bấm). */
  const [playing, setPlaying] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const photo = photos[Math.min(selected.kind === "image" ? selected.index : 0, Math.max(0, photos.length - 1))];
  const video = selected.kind === "video" ? videos[selected.index] : undefined;

  const playVideo = (index: number) => {
    setOverlay(false);
    setSelected({ kind: "video", index });
    setPlaying(true);
  };
  const showImage = (index: number) => {
    setOverlay(false);
    setPlaying(false);
    setSelected({ kind: "image", index });
  };
  const openOverlay = () => {
    setPlaying(false); // gỡ trình phát ở khung lớn — chỉ một video phát
    setOverlay(true);
  };
  const closeOverlay = useCallback(() => setOverlay(false), []);

  return (
    <div className="min-w-0 space-y-4">
      {/* Khung lớn: tỷ lệ cố định */}
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-neutral-50">
        {video ? (
          playing && !overlay ? (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-950">
              <VideoPlayer key={`${video.platform}:${video.videoId}`} video={video} fit="frame" />
            </div>
          ) : (
            <VideoCover video={video} onPlay={() => playVideo(selected.index)} large />
          )
        ) : photo ? (
          <Image
            src={photo.url}
            alt={photo.alt || name}
            fill
            unoptimized
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-contain"
          />
        ) : (
          placeholder
        )}
      </div>

      {video && (
        <div className="-mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="min-w-0 font-medium text-neutral-900">{video.title}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={openOverlay}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-300 px-3 font-medium hover:border-neutral-900"
            >
              <Maximize2 className="size-4" aria-hidden /> Xem lớn
            </button>
            <a
              href={video.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 font-medium text-neutral-700 underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-4" aria-hidden /> Mở video gốc
            </a>
          </div>
        </div>
      )}

      {videos.length > 0 && (
        <section aria-labelledby="video-san-pham" className="space-y-2">
          <h2 id="video-san-pham" className="text-base font-semibold">
            Video sản phẩm
          </h2>
          <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            {videos.map((v, i) => {
              const active = selected.kind === "video" && selected.index === i;
              return (
                <li key={`${v.platform}:${v.videoId}`} className="w-36 shrink-0 sm:w-44">
                  <button
                    type="button"
                    onClick={() => playVideo(i)}
                    aria-current={active ? "true" : undefined}
                    aria-label={`Xem video: ${v.title}`}
                    title={v.title}
                    className="group block w-full text-left"
                  >
                    <span
                      className={`relative block aspect-video overflow-hidden rounded-xl border-2 bg-neutral-900 ${
                        active ? "border-neutral-900" : "border-transparent group-hover:border-neutral-300"
                      }`}
                    >
                      {v.coverUrl ? (
                        <Image src={v.coverUrl} alt="" fill unoptimized sizes="176px" className="object-cover" />
                      ) : (
                        <span className="absolute inset-x-0 bottom-1 text-center text-[11px] font-medium text-white/80">{platformLabel(v.platform)}</span>
                      )}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex size-10 items-center justify-center rounded-full bg-black/60 ring-2 ring-white/90 transition group-hover:scale-105">
                          <Play className="size-5 translate-x-px fill-white text-white" aria-hidden />
                        </span>
                      </span>
                    </span>
                    <span className="mt-1.5 line-clamp-2 text-xs leading-snug font-medium text-neutral-800 sm:text-sm">{v.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(photos.length > 1 || (videos.length > 0 && photos.length > 0)) && (
        <section aria-labelledby={videos.length ? "anh-san-pham" : undefined} className="space-y-2">
          {videos.length > 0 && (
            <h2 id="anh-san-pham" className="text-base font-semibold">
              Hình ảnh sản phẩm
            </h2>
          )}
          <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Ảnh sản phẩm">
            {photos.map((p, i) => {
              const active = selected.kind === "image" && selected.index === i;
              return (
                <li key={p.url} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => showImage(i)}
                    aria-label={`Xem ảnh ${i + 1}`}
                    aria-current={active ? "true" : undefined}
                    className={`relative block size-16 overflow-hidden rounded-xl border-2 bg-neutral-50 sm:size-20 ${
                      active ? "border-neutral-900" : "border-transparent hover:border-neutral-300"
                    }`}
                  >
                    <Image src={p.url} alt="" fill unoptimized sizes="80px" className="object-cover" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {overlay && video && <VideoOverlay video={video} onClose={closeOverlay} />}
    </div>
  );
}

/** Ảnh bìa + nút Play nổi bật (chưa tải trình phát). */
function VideoCover({ video, onPlay, large }: { video: ProductVideo; onPlay: () => void; large?: boolean }) {
  return (
    <button type="button" onClick={onPlay} aria-label={`Phát video: ${video.title}`} className="group absolute inset-0 block bg-neutral-950">
      {video.coverUrl && <Image src={video.coverUrl} alt="" fill unoptimized sizes="(min-width: 768px) 50vw, 100vw" className="object-contain" />}
      <span className="absolute inset-0 flex items-center justify-center">
        <span
          className={`flex items-center justify-center rounded-full bg-black/60 ring-2 ring-white/90 transition group-hover:scale-105 ${large ? "size-16" : "size-10"}`}
        >
          <Play className={`translate-x-0.5 fill-white text-white ${large ? "size-8" : "size-5"}`} aria-hidden />
        </span>
      </span>
    </button>
  );
}

/**
 * Trình phát nhúng chính thức (YouTube nocookie / TikTok Embed Player). Chỉ được tạo khi khách bấm xem; gỡ khỏi trang
 * là dừng phát. Có chờ tải giới hạn thời gian; TikTok báo lỗi qua postMessage → hiện hướng dẫn mở video gốc.
 */
function VideoPlayer({ video, fit }: { video: ProductVideo; fit: "frame" | "overlay" }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setState((s) => (s === "loading" ? "failed" : s)), LOAD_TIMEOUT_MS);
    const onMessage = (e: MessageEvent) => {
      if (video.platform !== "tiktok" || e.origin !== "https://www.tiktok.com" || e.source !== frame.current?.contentWindow) return;
      const data = e.data as { "x-tiktok-player"?: boolean; type?: string } | null;
      if (!data || data["x-tiktok-player"] !== true) return;
      if (data.type === "onPlayerReady") setState("ready");
      if (data.type === "onPlayerError") setState("failed");
    };
    window.addEventListener("message", onMessage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    };
  }, [video.platform]);

  const portrait = video.orientation === "portrait";
  // Khung theo tỷ lệ video, vừa trong vùng chứa (không cắt, không kéo méo).
  const box =
    fit === "frame"
      ? portrait
        ? "h-full aspect-[9/16] max-w-full"
        : "w-full aspect-video max-h-full"
      : portrait
        ? "h-[min(88svh,calc(92vw*16/9))] aspect-[9/16]"
        : "w-[min(92vw,calc(80svh*16/9),1100px)] aspect-video";

  return (
    <div className={`relative bg-black ${box}`}>
      <iframe
        ref={frame}
        src={embedUrl(video.platform, video.videoId)}
        title={`${platformLabel(video.platform)}: ${video.title}`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        // YouTube yêu cầu Referer từ trang nhúng (thiếu sẽ lỗi 153).
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setState((s) => (s === "loading" ? "ready" : s))}
        className="absolute inset-0 size-full border-0"
      />
      {state === "loading" && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="size-8 animate-spin text-white" aria-hidden />
          <span className="sr-only">Đang tải video…</span>
        </span>
      )}
      {state === "failed" && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden bg-neutral-950 p-4 text-center text-sm text-white">
          {/* Ảnh bìa mờ phía sau để khách vẫn thấy video là gì. */}
          {video.coverUrl && <Image src={video.coverUrl} alt="" fill unoptimized sizes="50vw" className="object-cover opacity-35 blur-[2px]" />}
          <p className="relative max-w-xs font-medium drop-shadow">
            {video.platform === "tiktok"
              ? "TikTok chưa cho phát video này ngay trên website. Bấm nút dưới để xem trên TikTok."
              : "Không phát được video ngay tại đây (có thể video bị chặn nhúng hoặc mạng chậm)."}
          </p>
          <a
            href={video.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="relative inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 font-semibold text-neutral-900"
          >
            <ExternalLink className="size-4" aria-hidden /> Xem trên {platformLabel(video.platform)}
          </a>
        </div>
      )}
    </div>
  );
}

/** Lớp phủ “Xem lớn”: một trình phát lớn trên nền tối; đóng (nút, Esc, bấm nền) là gỡ trình phát → dừng phát. */
function VideoOverlay({ video, onClose }: { video: ProductVideo; onClose: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={video.title}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-3"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex w-full max-w-[1100px] items-center justify-between gap-3 text-white">
        <p className="min-w-0 truncate text-sm font-medium">{video.title}</p>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={video.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium hover:bg-white/10"
          >
            <ExternalLink className="size-4" aria-hidden /> Mở video gốc
          </a>
          <button ref={closeBtn} type="button" onClick={onClose} className="inline-flex size-10 items-center justify-center rounded-full hover:bg-white/10" aria-label="Đóng video">
            <X className="size-6" aria-hidden />
          </button>
        </div>
      </div>
      <VideoPlayer video={video} fit="overlay" />
    </div>
  );
}
