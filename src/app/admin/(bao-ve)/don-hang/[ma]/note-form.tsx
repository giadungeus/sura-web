"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { INTERNAL_NOTE_MAX } from "@/lib/order-status";
import { addNoteAction, type MutationState } from "../../../actions";

export function NoteForm({ code }: { code: string }) {
  const [body, setBody] = useState("");
  const [state, formAction, pending] = useActionState<MutationState, FormData>(async (prev, formData) => {
    const result = await addNoteAction(prev, formData);
    if (result.ok) setBody("");
    return result;
  }, {});

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="code" value={code} />
      <label htmlFor="internal-note" className="sr-only">
        Nội dung ghi chú nội bộ
      </label>
      <textarea
        id="internal-note"
        name="body"
        rows={2}
        maxLength={INTERNAL_NOTE_MAX}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="VD: Đã gọi xác nhận với khách lúc 9h."
        className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-100 sm:text-sm"
      />
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-emerald-700" : "text-brand-700"}`}>
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !body.trim()}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-neutral-900 px-4 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-40"
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        Thêm ghi chú
      </button>
    </form>
  );
}
