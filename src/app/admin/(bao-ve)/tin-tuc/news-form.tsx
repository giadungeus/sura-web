"use client";

import { useActionState, useRef, useState } from "react";
import { ExternalLink, ImagePlus, Loader2, X } from "lucide-react";
import { Field, Notice, inputClass } from "@/components/admin/form-ui";
import { MarkupEditor } from "@/components/admin/markup-editor";
import { IntentButtons, type ButtonDef } from "@/components/admin/publish-buttons";
import { PublishBadge, UpdatedLine } from "@/components/admin/publish-status";
import { CONTENT_TITLE_MAX } from "@/lib/content/pages";
import { slugify } from "@/lib/slug";
import { SeoFields } from "@/components/admin/seo-fields";
import { clipText, defaultTitle, markupToPlainText } from "@/lib/seo-text";
import type { AdminNews } from "@/lib/server/site-content";
import { uploadProductImageAction } from "../../catalog-actions";
import { saveNewsAction, type ContentFormState } from "../../content-actions";

const SUMMARY_MAX = 300;

export function NewsForm({ post, vars, hiddenPaths }: { post: AdminNews | null; vars: Record<string, string>; hiddenPaths: string[] }) {
  const [state, action, pending] = useActionState<ContentFormState, FormData>(saveNewsAction, {});
  const init = post?.edit ?? { title: "", slug: "", summary: "", body: "", coverFile: null, coverAlt: "", seoTitle: "", seoDescription: "" };
  const slugLocked = post?.slugLocked ?? false;
  const [title, setTitle] = useState(init.title);
  const [slug, setSlug] = useState(init.slug);
  const [slugTouched, setSlugTouched] = useState(post !== null);
  const [summary, setSummary] = useState(init.summary);
  const [body, setBody] = useState(init.body);
  const [cover, setCover] = useState<string | null>(init.coverFile);
  const [coverAlt, setCoverAlt] = useState(init.coverAlt ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Sau khi lưu/bỏ nháp, cập nhật ô nhập theo dữ liệu mới nhất từ server.
  const [syncedAt, setSyncedAt] = useState(post?.updatedAt);
  if (post && syncedAt !== post.updatedAt) {
    setSyncedAt(post.updatedAt);
    setTitle(post.edit.title);
    setSlug(post.edit.slug);
    setSummary(post.edit.summary);
    setBody(post.edit.body);
    setCover(post.edit.coverFile);
    setCoverAlt(post.edit.coverAlt ?? "");
  }
  const e = state.fieldErrors ?? {};

  // Dùng lại quy trình tải ảnh sản phẩm: kiểm tra nội dung, xoá EXIF/GPS, lưu WebP.
  const onPickCover = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await uploadProductImageAction(fd);
      if (res.ok) setCover(res.image.url.replace(/^\/anh\//, ""));
      else setUploadError(res.message);
    } catch {
      setUploadError("Không tải được ảnh. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const buttons: ButtonDef[] = [
    { intent: "draft", label: "Lưu nháp" },
    { intent: "publish", label: post?.status === "public" ? "Công khai bản này" : "Công khai", tone: "primary" },
  ];
  if (post?.hasDraft) buttons.push({ intent: "discard", label: "Bỏ bản nháp", tone: "danger", confirm: "Bỏ bản nháp và giữ nguyên bản đang công khai?" });
  if (post?.status === "public") buttons.push({ intent: "hide", label: "Ẩn bài viết", tone: "danger", confirm: "Ẩn bài này khỏi website?" });

  return (
    <form action={action} className="space-y-4" noValidate>
      {post && <input type="hidden" name="id" value={post.id} />}
      <input type="hidden" name="coverFile" value={cover ?? ""} />
      <input type="hidden" name="coverAlt" value={coverAlt} />
      <div className="space-y-2">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{post ? "Sửa bài viết" : "Viết bài mới"}</h1>
        {post && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <PublishBadge state={post.status} hasDraft={post.hasDraft} />
              {post.status === "public" && (
                <a href={`/tin-tuc/${post.liveSlug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
                  Xem trên website <ExternalLink className="size-3.5" aria-hidden />
                </a>
              )}
            </div>
            <UpdatedLine updatedAt={post.updatedAt} updatedBy={post.updatedBy} publishedAt={post.publishedAt} />
            {post.status === "public" && (
              <p className="text-xs text-neutral-500">
                Bài đang công khai: <b>Lưu nháp</b> không thay đổi nội dung khách đang thấy cho tới khi bấm <b>Công khai</b>.
              </p>
            )}
          </>
        )}
      </div>

      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}

      <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <Field id="news-title" label="Tiêu đề" required error={e.title}>
          <input
            id="news-title"
            name="title"
            value={title}
            maxLength={CONTENT_TITLE_MAX}
            onChange={(ev) => {
              setTitle(ev.target.value);
              if (!slugTouched && !slugLocked) setSlug(slugify(ev.target.value));
            }}
            className={inputClass(e.title)}
            aria-invalid={e.title ? true : undefined}
          />
        </Field>
        <Field
          id="news-slug"
          label="Slug (đường dẫn)"
          required
          error={e.slug}
          hint={slugLocked ? `Đã khoá vì bài từng công khai — đổi slug sẽ làm hỏng đường dẫn /tin-tuc/${slug} đang có.` : `Bài hiện tại /tin-tuc/${slug || "…"}`}
        >
          <input
            id="news-slug"
            name="slug"
            value={slug}
            readOnly={slugLocked}
            maxLength={80}
            onChange={(ev) => {
              setSlug(ev.target.value);
              setSlugTouched(true);
            }}
            className={inputClass(e.slug, "font-mono")}
            aria-invalid={e.slug ? true : undefined}
          />
        </Field>
        <Field id="news-summary" label="Mô tả ngắn" error={e.summary} hint="Hiện ở trang danh sách tin tức.">
          <textarea
            id="news-summary"
            name="summary"
            rows={2}
            value={summary}
            maxLength={SUMMARY_MAX}
            onChange={(ev) => setSummary(ev.target.value)}
            className={inputClass(e.summary)}
          />
        </Field>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Ảnh đại diện (tùy chọn)</p>
          {cover ? (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- ảnh đã chuẩn hoá, phục vụ qua /anh */}
              <img src={`/anh/${cover}`} alt="" className="h-24 w-40 rounded-xl border border-neutral-200 object-cover" />
              <button
                type="button"
                onClick={() => setCover(null)}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                <X className="size-4" aria-hidden /> Bỏ ảnh
              </button>
            </div>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
              {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
              {uploading ? "Đang tải ảnh…" : "Chọn ảnh"}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploading}
                onChange={(ev) => onPickCover(ev.target.files?.[0])}
              />
            </label>
          )}
          <p className="text-xs text-neutral-500">JPEG, PNG hoặc WebP, tối đa 5 MB. Ảnh được kiểm tra, xoá thông tin vị trí và lưu dạng WebP.</p>
          {cover && (
            <label className="block text-sm">
              <span className="font-medium">Mô tả ảnh (văn bản thay thế)</span>
              <input
                value={coverAlt}
                maxLength={200}
                onChange={(ev) => setCoverAlt(ev.target.value)}
                placeholder="Ví dụ: Cáp sạc màu đen cuộn tròn trên bàn"
                className={inputClass(e.coverAlt, "mt-1")}
              />
            </label>
          )}
          {(uploadError || e.coverFile || e.coverAlt) && <p className="text-sm text-brand-600">{uploadError ?? e.coverFile ?? e.coverAlt}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="news-body" className="block text-sm font-medium">
            Nội dung
          </label>
          <MarkupEditor id="news-body" name="body" value={body} onChange={setBody} vars={vars} hiddenPaths={hiddenPaths} error={e.body} rows={16} />
          {e.body && <p className="text-sm text-brand-600">{e.body}</p>}
        </div>
      </section>

      {/* SEO đi cùng bản đang sửa: bài đang công khai thì lưu vào bản nháp, chỉ áp dụng khi bấm Công khai. */}
      <SeoFields
        key={syncedAt ?? "moi"}
        idPrefix="news"
        initial={{ seoTitle: init.seoTitle ?? "", seoDescription: init.seoDescription ?? "" }}
        names={{ title: "seoTitle", description: "seoDescription" }}
        errors={e}
        path={`/tin-tuc/${slug || "…"}`}
        defaultTitle={defaultTitle(title || "Tiêu đề bài", vars.thuong_hieu ?? "")}
        defaultDescription={clipText(markupToPlainText(summary.trim() || body))}
      />

      <IntentButtons buttons={buttons} pending={pending || uploading} />
    </form>
  );
}
