"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Field, Notice, inputClass } from "@/components/admin/form-ui";
import { SETTING_LIMITS, phoneHref, zaloHref, type SiteSettings } from "@/lib/content/settings";
import { saveSettingsAction, type ContentFormState } from "../../content-actions";

const FIELDS: { key: keyof SiteSettings; label: string; required?: boolean; hint?: string; type?: string; multiline?: boolean }[] = [
  { key: "brandName", label: "Tên thương hiệu", required: true },
  { key: "companyName", label: "Đơn vị vận hành", hint: "Ví dụ: Công ty Ricotech." },
  { key: "hotline", label: "Hotline", hint: "Hiển thị đúng như nhập; liên kết gọi điện được tạo tự động.", type: "tel" },
  { key: "zalo", label: "Zalo", hint: "Số điện thoại Zalo hoặc link https://zalo.me/…" },
  { key: "email", label: "Email", type: "email" },
  { key: "address", label: "Địa chỉ" },
  { key: "supportHours", label: "Giờ hỗ trợ", hint: "Để trống nếu chưa công bố; khi trống, website không hiện dòng này." },
  { key: "footerDescription", label: "Mô tả ngắn ở chân trang", multiline: true },
];

export function SettingsForm({ initial }: { initial: SiteSettings }) {
  const [state, action, pending] = useActionState<ContentFormState, FormData>(saveSettingsAction, {});
  const [values, setValues] = useState(initial);
  const e = state.fieldErrors ?? {};
  const tel = values.hotline ? phoneHref(values.hotline) : null;
  const zalo = values.zalo ? zaloHref(values.zalo) : null;

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>}
      <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        {FIELDS.map((f) => {
          const id = `set-${f.key}`;
          const common = {
            id,
            name: f.key,
            value: values[f.key],
            maxLength: SETTING_LIMITS[f.key],
            onChange: (ev: { target: { value: string } }) => setValues((v) => ({ ...v, [f.key]: ev.target.value })),
            className: inputClass(e[f.key]),
            "aria-invalid": e[f.key] ? true : undefined,
          };
          return (
            <Field key={f.key} id={id} label={f.label} required={f.required} hint={f.hint} error={e[f.key]}>
              {f.multiline ? <textarea rows={2} {...common} /> : <input type={f.type ?? "text"} {...common} />}
              {f.key === "hotline" && values.hotline && (
                <p className="text-xs text-neutral-500">Liên kết: {tel ?? "— số chưa hợp lệ"}</p>
              )}
              {f.key === "zalo" && values.zalo && <p className="text-xs text-neutral-500">Liên kết: {zalo ?? "— chưa hợp lệ"}</p>}
            </Field>
          );
        })}
      </section>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Lưu cài đặt
      </button>
    </form>
  );
}
