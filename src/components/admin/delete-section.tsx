"use client";

import { useActionState } from "react";
import { Loader2, Trash } from "lucide-react";
import { Notice } from "@/components/admin/form-ui";

type FormState = { ok?: boolean; message?: string; at?: number };

/**
 * Khu vực “Xoá” ở cuối trang sửa. Hỏi xác nhận kèm đúng tên đối tượng. Khi không được xoá,
 * chỉ hiện lý do (server vẫn kiểm tra lại khi bấm xoá).
 */
export function DeleteSection({
  action,
  id,
  kind,
  name,
  blockedReason,
  note,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  id: string | number;
  kind: "sản phẩm" | "danh mục";
  name: string;
  blockedReason: string | null;
  note?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  return (
    <section className="space-y-3 rounded-2xl border border-brand-100 bg-white p-4 sm:p-5">
      <h2 className="font-semibold text-brand-700">Xoá {kind}</h2>
      {blockedReason ? (
        <p className="text-sm text-neutral-700">{blockedReason}</p>
      ) : (
        <form
          action={formAction}
          onSubmit={(e) => {
            if (!window.confirm(`Xoá hẳn ${kind} “${name}”?\n\nThao tác này không hoàn tác được.`)) e.preventDefault();
          }}
          className="space-y-3"
        >
          <input type="hidden" name="id" value={id} />
          {note && <p className="text-sm text-neutral-600">{note}</p>}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-brand-200 px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash className="size-4" aria-hidden />}
            Xoá {kind} “{name}”
          </button>
        </form>
      )}
      {state.message && !state.ok && <Notice tone="error">{state.message}</Notice>}
    </section>
  );
}
