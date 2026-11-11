"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Loader2, Plus, RefreshCw, Trash, Video } from "lucide-react";
import { ErrorText, inputClass } from "@/components/admin/form-ui";
import { MAX_VIDEOS_PER_PRODUCT, VIDEO_TITLE_MAX, platformLabel } from "@/lib/product-video";
import type { AdminVideo } from "@/lib/server/product-videos";
import { inspectVideoAction, refetchVideoCoverAction, uploadVideoCoverAction } from "../../catalog-actions";

export type VideoItem = AdminVideo & { uid: string };

let uidCounter = 0;
export const videoUid = () => `v${++uidCounter}`;

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Mục “Video sản phẩm” trong form sản phẩm: thêm link YouTube/TikTok (máy chủ kiểm tra), tiêu đề bắt buộc,
 * hướng ngang/dọc, ảnh bìa (từ nền tảng hoặc tải lên), sắp xếp, xoá. Video chỉ lưu khi bấm “Lưu sản phẩm”.
 */
export function VideoEditor({
  videos,
  onChange,
  errors,
}: {
  videos: VideoItem[];
  onChange: (next: VideoItem[] | ((prev: VideoItem[]) => VideoItem[])) => void;
  errors: Record<string, string>;
}) {
  const [link, setLink] = useState("");
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [uploadingUid, setUploadingUid] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const coverTarget = useRef<string | null>(null);
  const titleRefs = useRef(new Map<string, HTMLInputElement>());
  const [focusUid, setFocusUid] = useState<string | null>(null);

  // Đưa con trỏ vào ô tiêu đề của video vừa thêm SAU khi hàng đã hiển thị (tiêu đề bắt buộc).
  useEffect(() => {
    if (!focusUid) return;
    const el = titleRefs.current.get(focusUid);
    if (el) {
      el.focus();
      setFocusUid(null);
    }
  }, [focusUid, videos]);

  const add = async () => {
    const url = link.trim();
    if (!url || checking) return;
    if (videos.length >= MAX_VIDEOS_PER_PRODUCT) {
      setMessage({ tone: "error", text: `Tối đa ${MAX_VIDEOS_PER_PRODUCT} video.` });
      return;
    }
    setChecking(true);
    setMessage(null);
    try {
      const res = await inspectVideoAction(url);
      if (!res.ok) {
        setMessage({ tone: "error", text: res.message });
        return;
      }
      if (videos.some((v) => v.platform === res.video.platform && v.videoId === res.video.videoId)) {
        setMessage({ tone: "error", text: "Video này đã có trong danh sách." });
        return;
      }
      const item: VideoItem = { ...res.video, uid: videoUid() };
      onChange((prev) => [...prev, item]);
      setLink("");
      setMessage(res.coverMessage ? { tone: "info", text: res.coverMessage } : null);
      setFocusUid(item.uid);
    } catch {
      setMessage({ tone: "error", text: "Không kiểm tra được link (lỗi kết nối). Vui lòng thử lại." });
    } finally {
      setChecking(false);
    }
  };

  const update = (uid: string, patch: Partial<VideoItem>) => onChange((prev) => prev.map((v) => (v.uid === uid ? { ...v, ...patch } : v)));
  const move = (index: number, dir: -1 | 1) =>
    onChange((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  const remove = (uid: string) => onChange((prev) => prev.filter((v) => v.uid !== uid));

  const pickCover = (uid: string) => {
    coverTarget.current = uid;
    coverInput.current?.click();
  };
  const onCoverFile = async (file: File | undefined) => {
    const uid = coverTarget.current;
    if (coverInput.current) coverInput.current.value = "";
    if (!file || !uid) return;
    if (!ACCEPT.includes(file.type)) return setMessage({ tone: "error", text: `${file.name}: chỉ nhận JPEG, PNG hoặc WebP.` });
    if (file.size > MAX_BYTES) return setMessage({ tone: "error", text: `${file.name}: vượt quá 5 MB.` });
    setUploadingUid(uid);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadVideoCoverAction(fd);
      if (res.ok) {
        update(uid, { coverFile: res.fileName, coverUrl: res.url, coverSource: "upload" });
        setMessage(null);
      } else setMessage({ tone: "error", text: res.message });
    } catch {
      setMessage({ tone: "error", text: `${file.name}: không tải lên được (lỗi kết nối).` });
    } finally {
      setUploadingUid(null);
    }
  };

  /** Lấy lại ảnh bìa từ YouTube/TikTok cho video đã có — giữ tiêu đề, thứ tự; áp dụng khi bấm “Lưu”. */
  const refetchCover = async (v: VideoItem) => {
    setUploadingUid(v.uid);
    setMessage(null);
    try {
      const res = await refetchVideoCoverAction(v.url);
      if (res.ok) update(v.uid, { coverFile: res.fileName, coverUrl: res.url, coverSource: "platform" });
      else setMessage({ tone: "error", text: res.message });
    } catch {
      setMessage({ tone: "error", text: "Không lấy được ảnh bìa (lỗi kết nối). Vui lòng thử lại." });
    } finally {
      setUploadingUid(null);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">Video sản phẩm</h2>
        <p className="text-xs text-neutral-500">
          Dán link YouTube (kể cả Shorts) hoặc TikTok — chỉ link, không dán mã nhúng. Tối đa {MAX_VIDEOS_PER_PRODUCT} video. Video phát trên
          YouTube/TikTok, website không lưu tệp video.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={link}
          onChange={(ev) => setLink(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              void add();
            }
          }}
          placeholder="https://www.youtube.com/watch?v=… hoặc https://www.tiktok.com/@…/video/…"
          aria-label="Link video YouTube hoặc TikTok"
          className={`${inputClass} flex-1`}
          maxLength={500}
          inputMode="url"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={checking || !link.trim() || videos.length >= MAX_VIDEOS_PER_PRODUCT}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-neutral-900 px-4 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-40"
        >
          {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          {checking ? "Đang kiểm tra…" : "Thêm video"}
        </button>
      </div>
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-xl p-3 text-sm ${message.tone === "error" ? "bg-brand-50 text-brand-700" : "bg-sky-50 text-sky-900"}`}>
          {message.text}
        </p>
      )}
      {errors.videos && <ErrorText>{errors.videos}</ErrorText>}
      <input ref={coverInput} type="file" accept={ACCEPT.join(",")} hidden onChange={(ev) => void onCoverFile(ev.target.files?.[0])} aria-label="Chọn ảnh bìa video" />

      {videos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-5 text-center text-sm text-neutral-500">
          Chưa có video. Trang sản phẩm sẽ không hiện hàng “Video sản phẩm”.
        </p>
      ) : (
        <ol className="space-y-3">
          {videos.map((v, i) => {
            const err = (f: string) => errors[`videos.${i}.${f}`];
            return (
              <li key={v.uid} className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-3 sm:flex-row">
                <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-neutral-100 sm:w-44">
                  {v.coverUrl ? (
                    <Image src={v.coverUrl} alt="" fill unoptimized sizes="176px" className="object-cover" />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-1 text-xs text-neutral-500">
                      <Video className="size-6" aria-hidden />
                      Chưa có ảnh bìa
                    </span>
                  )}
                  <span className="absolute top-1.5 left-1.5 rounded-md bg-neutral-900/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    {platformLabel(v.platform)} · {v.orientation === "portrait" ? "Dọc" : "Ngang"}
                  </span>
                  {uploadingUid === v.uid && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/70">
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="block text-sm">
                    <span className="font-medium">
                      Tiêu đề video <span className="text-brand-600">*</span>
                    </span>
                    <input
                      ref={(el) => {
                        if (el) titleRefs.current.set(v.uid, el);
                        else titleRefs.current.delete(v.uid);
                      }}
                      value={v.title}
                      onChange={(ev) => update(v.uid, { title: ev.target.value })}
                      maxLength={VIDEO_TITLE_MAX}
                      placeholder="vd. Hướng dẫn kết nối, Trải nghiệm thực tế"
                      className={`${inputClass} mt-1 w-full`}
                      aria-invalid={Boolean(err("title")) || undefined}
                    />
                  </label>
                  {err("title") && <ErrorText>{err("title")}</ErrorText>}
                  {err("url") && <ErrorText>{err("url")}</ErrorText>}
                  {err("cover") && <ErrorText>{err("cover")}</ErrorText>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                    <a href={v.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1 truncate underline underline-offset-2">
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{v.url}</span>
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <label className="inline-flex items-center gap-1.5">
                      <span className="text-neutral-600">Hướng</span>
                      <select
                        value={v.orientation}
                        onChange={(ev) => update(v.uid, { orientation: ev.target.value === "portrait" ? "portrait" : "landscape" })}
                        className="h-9 rounded-lg border border-neutral-300 bg-white px-2 text-sm"
                      >
                        <option value="landscape">Ngang 16:9</option>
                        <option value="portrait">Dọc 9:16</option>
                      </select>
                    </label>
                    <button type="button" onClick={() => pickCover(v.uid)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-300 px-3 hover:bg-neutral-50">
                      <ImagePlus className="size-4" aria-hidden />
                      {v.coverUrl ? "Đổi ảnh bìa" : "Tải ảnh bìa"}
                    </button>
                    {v.coverSource !== "upload" && (
                      <button
                        type="button"
                        onClick={() => void refetchCover(v)}
                        disabled={uploadingUid !== null}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-300 px-3 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        <RefreshCw className="size-4" aria-hidden />
                        {v.coverUrl ? "Lấy lại ảnh bìa" : `Lấy ảnh bìa từ ${platformLabel(v.platform)}`}
                      </button>
                    )}
                    {v.coverUrl && (
                      <button
                        type="button"
                        onClick={() => update(v.uid, { coverFile: null, coverUrl: null, coverSource: "none" })}
                        className="inline-flex h-9 items-center rounded-full px-3 text-neutral-600 hover:bg-neutral-100"
                      >
                        Bỏ ảnh bìa
                      </button>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="inline-flex size-9 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 disabled:opacity-30" aria-label="Chuyển video lên">
                        <ArrowUp className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === videos.length - 1}
                        className="inline-flex size-9 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
                        aria-label="Chuyển video xuống"
                      >
                        <ArrowDown className="size-4" aria-hidden />
                      </button>
                      <button type="button" onClick={() => remove(v.uid)} className="inline-flex size-9 items-center justify-center rounded-full text-neutral-600 hover:bg-brand-50 hover:text-brand-600" aria-label="Xoá video">
                        <Trash className="size-4" aria-hidden />
                      </button>
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
