"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import {
  CANCELLABLE,
  CANCEL_REASON_LIMITS,
  NEXT_STATUS,
  STATUS_LABELS,
  type OrderStatus,
} from "@/lib/order-status";
import { changeStatusAction, type MutationState } from "../../../actions";

const FLOW: OrderStatus[] = ["cho_xac_nhan", "da_xac_nhan", "dang_giao", "hoan_thanh"];

export function StatusPanel({ code, status }: { code: string; status: OrderStatus }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState<MutationState, FormData>(async (prev, formData) => {
    const result = await changeStatusAction(prev, formData);
    if (result.ok) {
      setCancelOpen(false);
      setReason("");
    }
    return result;
  }, {});

  const next = NEXT_STATUS[status];
  const canCancel = CANCELLABLE.has(status);
  const currentIndex = FLOW.indexOf(status);
  const reasonTooShort = reason.trim().length < CANCEL_REASON_LIMITS.min;

  return (
    <div className="space-y-4">
      {/* Các bước xử lý */}
      <ol className="grid grid-cols-4 gap-1 text-center text-[11px] leading-tight sm:text-xs">
        {FLOW.map((step, i) => {
          const done = status !== "da_huy" && i <= currentIndex;
          return (
            <li key={step} className="flex flex-col items-center gap-1">
              <span
                className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${
                  done ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-400"
                }`}
                aria-hidden
              >
                {done && i < currentIndex ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={done ? "font-medium text-neutral-900" : "text-neutral-400"}>{STATUS_LABELS[step]}</span>
            </li>
          );
        })}
      </ol>

      {status === "da_huy" && (
        <p className="rounded-xl bg-neutral-100 p-3 text-sm text-neutral-700">Đơn đã bị huỷ. Không thể thay đổi trạng thái.</p>
      )}
      {status === "hoan_thanh" && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Đơn đã hoàn thành.</p>
      )}

      {state.message && (
        <p
          role={state.ok ? "status" : "alert"}
          className={`rounded-xl p-3 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-brand-50 text-brand-700"}`}
        >
          {state.message}
        </p>
      )}

      {next && !cancelOpen && (
        <form action={formAction}>
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="expected" value={status} />
          <input type="hidden" name="to" value={next} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Chuyển sang “{STATUS_LABELS[next]}”
          </button>
        </form>
      )}

      {canCancel && !cancelOpen && (
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          disabled={pending}
          className="inline-flex h-11 w-full items-center justify-center rounded-full border border-neutral-300 text-sm font-medium text-brand-700 hover:border-brand-500 hover:bg-brand-50 disabled:opacity-60"
        >
          Huỷ đơn
        </button>
      )}

      {canCancel && cancelOpen && (
        <form action={formAction} className="space-y-3 rounded-xl border border-brand-100 bg-brand-50/50 p-3">
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="expected" value={status} />
          <input type="hidden" name="to" value="da_huy" />
          <div className="space-y-1.5">
            <label htmlFor="cancel-reason" className="block text-sm font-medium">
              Lý do huỷ <span className="text-brand-600">*</span>
            </label>
            <textarea
              id="cancel-reason"
              name="reason"
              rows={3}
              required
              minLength={CANCEL_REASON_LIMITS.min}
              maxLength={CANCEL_REASON_LIMITS.max}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Khách gọi điện yêu cầu huỷ, hết hàng…"
              aria-describedby="cancel-reason-hint"
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-100 sm:text-sm"
            />
            <p id="cancel-reason-hint" className="text-xs text-neutral-500">
              Bắt buộc, ít nhất {CANCEL_REASON_LIMITS.min} ký tự. Huỷ xong không thể khôi phục.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              disabled={pending}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-full border border-neutral-300 bg-white text-sm hover:bg-neutral-50"
            >
              <X className="size-4" aria-hidden /> Không huỷ
            </button>
            <button
              type="submit"
              disabled={pending || reasonTooShort}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Xác nhận huỷ
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
