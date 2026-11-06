"use client";

import { useActionState, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Field, Notice, inputClass } from "@/components/admin/form-ui";
import { MarkupEditor } from "@/components/admin/markup-editor";
import { IntentButtons, type ButtonDef } from "@/components/admin/publish-buttons";
import { PublishBadge, UpdatedLine } from "@/components/admin/publish-status";
import { CONTENT_TITLE_MAX } from "@/lib/content/pages";
import type { AdminPage } from "@/lib/server/site-content";
import { SeoFields } from "@/components/admin/seo-fields";
import { applyVariables } from "@/lib/content/markup";
import { clipText, defaultTitle, markupToPlainText } from "@/lib/seo-text";
import { savePageAction, type ContentFormState } from "../../../content-actions";

export function PageEditor({ page, vars, hiddenPaths }: { page: AdminPage; vars: Record<string, string>; hiddenPaths: string[] }) {
  const [state, action, pending] = useActionState<ContentFormState, FormData>(savePageAction, {});
  const [title, setTitle] = useState(page.editTitle);
  const [body, setBody] = useState(page.editBody);
  // Sau khi lưu/bỏ nháp, server gửi dữ liệu mới: cập nhật ô nhập theo bản mới nhất.
  const [syncedAt, setSyncedAt] = useState(page.updatedAt);
  if (syncedAt !== page.updatedAt) {
    setSyncedAt(page.updatedAt);
    setTitle(page.editTitle);
    setBody(page.editBody);
  }
  const e = state.fieldErrors ?? {};

  const buttons: ButtonDef[] = [
    { intent: "draft", label: "Lưu nháp" },
    { intent: "publish", label: page.isPublic ? "Công khai bản này" : "Công khai", tone: "primary" },
  ];
  if (page.hasDraft)
    buttons.push({ intent: "discard", label: "Bỏ bản nháp", tone: "danger", confirm: "Bỏ bản nháp và giữ nguyên bản đang công khai?" });
  if (page.isPublic)
    buttons.push({
      intent: "unpublish",
      label: "Chuyển về Nháp (ẩn trang)",
      tone: "danger",
      confirm: "Ẩn trang này khỏi website? Liên kết ở menu/chân trang cũng sẽ ẩn.",
    });

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="slug" value={page.slug} />
      <div className="space-y-2">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{page.label}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <PublishBadge state={page.isPublic ? "public" : "draft"} hasDraft={page.hasDraft} />
          {page.isPublic && (
            <a href={page.path} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
              Xem trên website <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
        <UpdatedLine updatedAt={page.updatedAt} updatedBy={page.updatedBy} publishedAt={page.publishedAt} />
        {page.isPublic && (
          <p className="text-xs text-neutral-500">
            Trang đang công khai: <b>Lưu nháp</b> không thay đổi nội dung khách đang thấy cho tới khi bấm <b>Công khai</b>.
          </p>
        )}
      </div>

      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}

      <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <Field id="page-title" label="Tiêu đề" required error={e.title} hint="Có thể dùng biến, ví dụ {thuong_hieu}.">
          <input
            id="page-title"
            name="title"
            value={title}
            maxLength={CONTENT_TITLE_MAX}
            onChange={(ev) => setTitle(ev.target.value)}
            className={inputClass(e.title)}
            aria-invalid={e.title ? true : undefined}
          />
        </Field>
        <div className="space-y-1.5">
          <label htmlFor="page-body" className="block text-sm font-medium">
            Nội dung
          </label>
          <MarkupEditor id="page-body" name="body" value={body} onChange={setBody} vars={vars} hiddenPaths={hiddenPaths} error={e.body} />
          {e.body && <p className="text-sm text-brand-600">{e.body}</p>}
        </div>
      </section>

      {/* SEO đi cùng bản đang sửa: trang đang công khai thì lưu vào bản nháp, chỉ áp dụng khi bấm Công khai. */}
      <SeoFields
        key={syncedAt ?? "trang"}
        idPrefix="page"
        initial={page.editSeo}
        names={{ title: "seoTitle", description: "seoDescription" }}
        errors={e}
        path={page.path}
        defaultTitle={defaultTitle(applyVariables(title, vars) || page.label, vars.thuong_hieu ?? "")}
        defaultDescription={clipText(markupToPlainText(applyVariables(body, vars), true))}
      />

      <IntentButtons buttons={buttons} pending={pending} />
    </form>
  );
}
