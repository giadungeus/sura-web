import { AlertCircle } from "lucide-react";

export function inputClass(error?: string, extra = "") {
  return `w-full rounded-xl border bg-white px-3 py-2 text-base outline-none placeholder:text-neutral-400 sm:text-sm ${
    error
      ? "border-brand-500 focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
      : "border-neutral-300 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-100"
  } ${extra}`;
}

export function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span className="text-brand-600"> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-neutral-500">
          {hint}
        </p>
      )}
      {error && <ErrorText id={`${id}-error`}>{error}</ErrorText>}
    </div>
  );
}

export function ErrorText({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-brand-600">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function Notice({ tone = "success", children }: { tone?: "success" | "error"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl p-3 text-sm ${tone === "error" ? "bg-brand-50 text-brand-700" : "bg-emerald-50 text-emerald-800"}`}
    >
      {children}
    </p>
  );
}

export function VisibilityBadge({ visible }: { visible: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${
        visible ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-neutral-100 text-neutral-600 ring-neutral-200"
      }`}
    >
      {visible ? "Đang hiện" : "Đang ẩn"}
    </span>
  );
}
