"use client";

import { useActionState } from "react";
import { AlertCircle, Info, Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "../actions";

export function LoginForm({ next, notice, noAdmin }: { next: string; notice: string | null; noAdmin: boolean }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="tiep" value={next} />

      {noAdmin && (
        <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Chưa có tài khoản quản trị. Trên máy chạy website, mở terminal trong thư mục dự án và chạy{" "}
            <code className="rounded bg-amber-100 px-1 font-mono">npm run admin:setup</code>.
          </p>
        </div>
      )}
      {notice && !state.error && (
        <p role="status" className="rounded-xl bg-neutral-100 p-3 text-sm text-neutral-700">
          {notice}
        </p>
      )}
      {state.error && (
        <p role="alert" className="flex gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="admin-username" className="block text-sm font-medium">
          Tên đăng nhập
        </label>
        <input
          id="admin-username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={64}
          defaultValue={state.username}
          key={state.username ?? ""}
          className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-100 sm:text-sm"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="admin-password" className="block text-sm font-medium">
          Mật khẩu
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-100 sm:text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden /> Đang đăng nhập…
          </>
        ) : (
          "Đăng nhập"
        )}
      </button>
    </form>
  );
}
