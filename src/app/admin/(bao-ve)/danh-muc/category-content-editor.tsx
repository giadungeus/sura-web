"use client";

import { useActionState, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Field, Notice, inputClass } from "@/components/admin/form-ui";
import { MarkupEditor } from "@/components/admin/markup-editor";
import { IntentButtons, type ButtonDef } from "@/components/admin/publish-buttons";
import { SeoFields } from "@/components/admin/seo-fields";
import { clipText, defaultTitle, markupToPlainText } from "@/lib/seo-text";
import type { AdminCategoryContent } from "@/lib/server/admin-catalog";
import { saveCategoryContentAction, type FormState } from "../../catalog-actions";

/**
 * Khối “Nội dung & SEO” của danh mục: mô tả ngắn, nội dung chi tiết (hiện dưới danh sách sản phẩm ở trang đầu),
 * SEO. Lưu nháp không đổi những gì khách đang thấy; Công khai áp dụng tất cả cùng lúc, không đổi Hiện/Ẩn.
 */
export function CategoryContentEditor({
  categoryId,
  name,
  slug,
  isVisible,
  content,
  vars,
  hiddenPaths,
}: {
  categoryId: number;
  name: string;
  slug: string;
  isVisible: boolean;
  content: AdminCategoryContent;
  vars: Record<string, string>;
  hiddenPaths: string[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCategoryContentAction, {});
  const [description, setDescription] = useState(content.edit.description);
  const [body, setBody] = useState(content.edit.body);
  const e = state.fieldErrors ?? {};

  const buttons: ButtonDef[] = [
    { intent: "draft", label: "Lưu nháp" },
    { intent: "publish", label: "Công khai", tone: "primary" },
  ];
  if (content.hasDraft) buttons.push({ intent: "discard", label: "Bỏ bản nháp", tone: "danger", confirm: "Bỏ bản nháp và giữ nguyên nội dung đang công khai?" });

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="id" value={categoryId} />
      <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <div>
          <h2 className="font-semibold">Nội dung &amp; SEO</h2>
          <p className="text-sm text-neutral-500">
            {content.hasDraft ? "Đang có bản nháp chưa công khai — khách vẫn thấy bản cũ." : "Đang hiển thị bản công khai."}{" "}
            {!isVisible && "Danh mục đang Ẩn: Công khai nội dung không làm hiện danh mục."}
          </p>
          {isVisible && (
            <a href={`/danh-muc/${slug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
              Xem trên website <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
        {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}

        <Field id="cc-desc" label="Mô tả ngắn" error={e.description} hint="Hiện dưới tên danh mục; dùng làm mô tả SEO mặc định.">
          <input
            id="cc-desc"
            name="description"
            value={description}
            maxLength={300}
            onChange={(ev) => setDescription(ev.target.value)}
            className={inputClass(e.description)}
          />
        </Field>
        <div className="space-y-1.5">
          <label htmlFor="cc-body" className="block text-sm font-medium">
            Nội dung chi tiết
          </label>
          <MarkupEditor id="cc-body" name="body" value={body} onChange={setBody} vars={vars} hiddenPaths={hiddenPaths} error={e.body} rows={14} />
          <p className="text-xs text-neutral-500">
            Hiện dưới danh sách sản phẩm và phân trang, chỉ ở trang đầu (không lọc/sắp xếp). Dùng “##”/“###” cho tiêu đề mục — tên danh mục đã là
            tiêu đề chính của trang. Để trống thì không hiện.
          </p>
          {e.body && <p className="text-sm text-brand-600">{e.body}</p>}
        </div>
      </section>

      <SeoFields
        idPrefix="cc"
        initial={{ seoTitle: content.edit.seoTitle, seoDescription: content.edit.seoDescription }}
        names={{ title: "seoTitle", description: "seoDescription" }}
        errors={e}
        path={`/danh-muc/${slug}`}
        defaultTitle={defaultTitle(name, vars.thuong_hieu ?? "")}
        defaultDescription={clipText(markupToPlainText(description.trim()))}
      />

      <IntentButtons buttons={buttons} pending={pending} />
    </form>
  );
}
