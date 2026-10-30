"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Banknote, CheckCircle2, Loader2, ShoppingCart } from "lucide-react";
import { ProductImage } from "@/components/product/product-image";
import {
  CUSTOMER_LIMITS,
  validateCustomer,
  type CustomerField,
  type CustomerInput,
  type FieldErrors,
} from "@/lib/checkout/customer";
import type { CartIssue, OrderItemInput, Quote, QuoteResult } from "@/lib/checkout/types";
import { formatVND } from "@/lib/format";
import { uuidv4 } from "@/lib/uuid";
import { useCartStore } from "@/store/cart";
import { placeOrder, previewOrder } from "./actions";

const FIELD_ORDER: CustomerField[] = ["name", "phone", "address", "note"];
const FIELD_LABELS: Record<CustomerField, string> = {
  name: "Họ và tên",
  phone: "Số điện thoại",
  address: "Địa chỉ nhận hàng",
  note: "Ghi chú",
};
const fieldId = (field: CustomerField) => `checkout-${field}`;

export function CheckoutView() {
  const router = useRouter();
  const hydrated = useCartStore((s) => s.hasHydrated);
  const items = useCartStore((s) => s.items);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const syncUnitPrices = useCartStore((s) => s.syncUnitPrices);
  const clearCart = useCartStore((s) => s.clear);

  // ───── Báo giá từ server ─────
  // Chỉ gửi tham chiếu sản phẩm + số lượng; giá luôn do server tính.
  const signature = useMemo(
    () =>
      JSON.stringify(
        items.map<OrderItemInput>((i) => ({
          productId: i.productId,
          options: i.options,
          quantity: i.quantity,
        })),
      ),
    [items],
  );
  const [reloadToken, setReloadToken] = useState(0);
  const [quoteState, setQuoteState] = useState<{ signature: string; token: number; result: QuoteResult } | null>(
    null,
  );

  useEffect(() => {
    if (!hydrated || signature === "[]") return;
    let cancelled = false;
    previewOrder(JSON.parse(signature))
      .then((result) => {
        if (!cancelled) setQuoteState({ signature, token: reloadToken, result });
      })
      .catch(() => {
        if (!cancelled)
          setQuoteState({
            signature,
            token: reloadToken,
            result: { ok: false, message: "Không kết nối được máy chủ để kiểm tra giỏ hàng." },
          });
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, signature, reloadToken]);

  const quoteCurrent =
    quoteState !== null && quoteState.signature === signature && quoteState.token === reloadToken;
  const quote: Quote | null = quoteCurrent && quoteState.result.ok ? quoteState.result.quote : null;
  const quoteError = quoteCurrent && !quoteState.result.ok ? quoteState.result.message : null;
  const quoteLoading = !quoteCurrent;

  // Giữ giá trong giỏ khớp với giá server.
  useEffect(() => {
    if (!quote) return;
    syncUnitPrices(Object.fromEntries(quote.lines.map((l) => [l.key, l.unitPrice])));
  }, [quote, syncUnitPrices]);

  // ───── Form ─────
  const [form, setForm] = useState<CustomerInput>({ name: "", phone: "", address: "", note: "" });
  const [attempted, setAttempted] = useState(false);
  const [serverFieldErrors, setServerFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [placedCode, setPlacedCode] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const validation = validateCustomer(form);
  const fieldErrors: FieldErrors = attempted
    ? { ...serverFieldErrors, ...(validation.ok ? {} : validation.errors) }
    : {};
  const errorFields = FIELD_ORDER.filter((f) => fieldErrors[f]);

  const setField = (field: CustomerField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setServerFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const applyFixes = (issues: CartIssue[]) => {
    for (const issue of issues) {
      if (issue.fix.type === "remove") removeItem(issue.key);
      else updateQuantity(issue.key, issue.fix.quantity);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current || placedCode) return; // Chặn bấm liên tiếp.

    setAttempted(true);
    setFormError(null);
    if (!validation.ok) {
      const first = FIELD_ORDER.find((f) => validation.errors[f]);
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    if (!quote || quote.issues.length > 0 || quote.lines.length === 0) {
      setFormError("Vui lòng kiểm tra lại giỏ hàng trước khi đặt.");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    // Giữ nguyên khóa cho mọi lần gửi lại từ trang này để server không tạo đơn trùng.
    idempotencyKeyRef.current ??= uuidv4();

    let succeeded = false;
    try {
      const result = await placeOrder({
        idempotencyKey: idempotencyKeyRef.current,
        customer: validation.value,
        items: JSON.parse(signature),
        expectedTotal: quote.total,
      });

      if (result.ok) {
        succeeded = true;
        setPlacedCode(result.code);
        clearCart(); // Chỉ xoá giỏ sau khi đơn đã được lưu.
        router.replace(`/don-hang/${result.code}`);
        return;
      }

      setFormError(result.message);
      if (result.kind === "validation") {
        setServerFieldErrors(result.fieldErrors);
      } else if (result.kind === "cart" || result.kind === "price-changed") {
        setReloadToken((t) => t + 1);
      }
    } catch {
      setFormError(
        "Không kết nối được máy chủ. Đơn hàng có thể chưa được tạo; bấm “Đặt hàng” lần nữa để thử lại (sẽ không tạo đơn trùng).",
      );
    } finally {
      if (!succeeded) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  };

  // ───── Hiển thị ─────
  if (placedCode) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-200 px-6 py-16 text-center">
        <CheckCircle2 className="size-10 text-emerald-600" aria-hidden />
        <p className="font-medium">Đặt hàng thành công! Đang mở trang đơn hàng…</p>
        <Link href={`/don-hang/${placedCode}`} className="text-sm underline underline-offset-4">
          Xem đơn {placedCode}
        </Link>
      </div>
    );
  }

  if (!hydrated) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Đang tải">
        <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-neutral-300 px-6 py-16 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-neutral-100">
          <ShoppingCart className="size-7 text-neutral-400" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="font-medium">Giỏ hàng đang trống</p>
          <p className="text-sm text-neutral-500">Hãy thêm sản phẩm vào giỏ trước khi thanh toán.</p>
        </div>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Tiếp tục mua sắm
        </Link>
      </div>
    );
  }

  const issues = quote?.issues ?? [];
  const canSubmit = !submitting && !!quote && issues.length === 0 && quote.lines.length > 0;

  const submitLabel = submitting ? (
    <>
      <Loader2 className="size-4 animate-spin" aria-hidden /> Đang đặt hàng…
    </>
  ) : (
    "Đặt hàng"
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <form
        id="checkout-form"
        onSubmit={handleSubmit}
        noValidate
        className="space-y-6"
        aria-describedby={formError ? "checkout-form-error" : undefined}
      >
        {formError && (
          <div
            id="checkout-form-error"
            role="alert"
            className="flex gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-700"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{formError}</p>
          </div>
        )}

        {attempted && errorFields.length > 0 && (
          <div role="alert" className="rounded-2xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-700">
            <p className="font-medium">Vui lòng kiểm tra lại {errorFields.length} mục:</p>
            <ul className="mt-1 list-disc pl-5">
              {errorFields.map((f) => (
                <li key={f}>
                  <a href={`#${fieldId(f)}`} className="underline underline-offset-2">
                    {FIELD_LABELS[f]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <section className="space-y-4 rounded-2xl border border-neutral-200 p-4 sm:p-5">
          <h2 className="font-semibold">Thông tin nhận hàng</h2>
          <Field field="name" required error={fieldErrors.name}>
            <input
              id={fieldId("name")}
              name="name"
              type="text"
              autoComplete="name"
              maxLength={CUSTOMER_LIMITS.name.max}
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Nguyễn Văn A"
              {...ariaFor("name", fieldErrors.name)}
              className={inputClass(fieldErrors.name)}
            />
          </Field>
          <Field field="phone" required error={fieldErrors.phone}>
            <input
              id={fieldId("phone")}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={20}
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="0912 345 678"
              {...ariaFor("phone", fieldErrors.phone)}
              className={inputClass(fieldErrors.phone)}
            />
          </Field>
          <Field
            field="address"
            required
            error={fieldErrors.address}
            hint="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố."
          >
            <textarea
              id={fieldId("address")}
              name="address"
              rows={3}
              autoComplete="street-address"
              maxLength={CUSTOMER_LIMITS.address.max}
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              placeholder="12 Nguyễn Huệ, P. Bến Nghé, Q. 1, TP. Hồ Chí Minh"
              {...ariaFor("address", fieldErrors.address, true)}
              className={inputClass(fieldErrors.address)}
            />
          </Field>
          <Field
            field="note"
            error={fieldErrors.note}
            hint={`Không bắt buộc. Tối đa ${CUSTOMER_LIMITS.note.max} ký tự.`}
          >
            <textarea
              id={fieldId("note")}
              name="note"
              rows={2}
              maxLength={CUSTOMER_LIMITS.note.max}
              value={form.note}
              onChange={(e) => setField("note", e.target.value)}
              placeholder="VD: Giao giờ hành chính, gọi trước khi giao."
              {...ariaFor("note", fieldErrors.note, true)}
              className={inputClass(fieldErrors.note)}
            />
          </Field>
        </section>

        <fieldset className="space-y-3 rounded-2xl border border-neutral-200 p-4 sm:p-5">
          <legend className="sr-only">Phương thức thanh toán</legend>
          <p className="font-semibold" aria-hidden>
            Phương thức thanh toán
          </p>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-900 p-3">
            <input type="radio" name="payment" value="COD" checked readOnly className="size-4 accent-neutral-900" />
            <Banknote className="size-5 text-neutral-600" aria-hidden />
            <span className="text-sm">
              <span className="font-medium">Thanh toán khi nhận hàng (COD)</span>
              <span className="block text-neutral-500">Chưa hỗ trợ thanh toán online.</span>
            </span>
          </label>
        </fieldset>
      </form>

      <aside aria-label="Đơn hàng của bạn" className="space-y-4 lg:sticky lg:top-24">
        <section className="rounded-2xl border border-neutral-200 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Đơn hàng ({items.reduce((s, i) => s + i.quantity, 0)} sản phẩm)</h2>
            <Link href="/gio-hang" className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900">
              Sửa giỏ hàng
            </Link>
          </div>

          {issues.length > 0 && (
            <div role="alert" className="mb-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Một số sản phẩm cần cập nhật:</p>
              <ul className="space-y-1">
                {issues.map((issue) => {
                  const item = items.find((i) => i.key === issue.key);
                  return (
                    <li key={issue.key}>
                      <span className="font-medium">{item?.name ?? "Sản phẩm"}</span>
                      {item && Object.values(item.options).length > 0 && (
                        <span> ({Object.values(item.options).join(" · ")})</span>
                      )}
                      : {issue.message}
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                onClick={() => applyFixes(issues)}
                className="rounded-full bg-amber-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
              >
                Cập nhật giỏ hàng
              </button>
            </div>
          )}

          {quoteError && (
            <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-brand-50 p-3 text-sm text-brand-700">
              <span>{quoteError}</span>
              <button
                type="button"
                onClick={() => setReloadToken((t) => t + 1)}
                className="shrink-0 font-medium underline underline-offset-2"
              >
                Thử lại
              </button>
            </div>
          )}

          {quoteLoading && !quote ? (
            <div className="space-y-3" aria-busy="true" aria-label="Đang kiểm tra giỏ hàng">
              {items.map((i) => (
                <div key={i.key} className="h-16 animate-pulse rounded-xl bg-neutral-100" />
              ))}
            </div>
          ) : (
            quote && (
              <ul className="divide-y divide-neutral-100">
                {quote.lines.map((line) => (
                  <li key={line.key} className="flex gap-3 py-3 first:pt-0">
                    <div className="relative shrink-0">
                      <ProductImage image={line.image} label={line.name} className="w-14 rounded-lg" iconClassName="size-6" />
                      <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1 text-[11px] font-semibold text-white">
                        {line.quantity}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="line-clamp-2 font-medium">{line.name}</p>
                      {Object.keys(line.options).length > 0 && (
                        <p className="text-xs text-neutral-500">
                          {Object.entries(line.options)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                        </p>
                      )}
                      <p className="text-xs text-neutral-500">
                        {formatVND(line.unitPrice)} × {line.quantity}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium">{formatVND(line.lineTotal)}</p>
                  </li>
                ))}
              </ul>
            )
          )}

          {quote && (
            <dl className="mt-3 space-y-1.5 border-t border-neutral-200 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Tạm tính</dt>
                <dd>{formatVND(quote.subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-neutral-500">Phí vận chuyển</dt>
                <dd>{quote.shippingFee === 0 ? "0 ₫" : formatVND(quote.shippingFee)}</dd>
              </div>
              <p className="text-xs text-emerald-700">{quote.shippingLabel}</p>
              <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold">
                <dt>Tổng cộng</dt>
                <dd className="text-brand-600">{formatVND(quote.total)}</dd>
              </div>
              <p className="text-xs text-neutral-500">Thanh toán khi nhận hàng (COD).</p>
            </dl>
          )}

          <button
            type="submit"
            form="checkout-form"
            disabled={!canSubmit}
            aria-busy={submitting}
            className="mt-4 hidden h-12 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 lg:inline-flex"
          >
            {submitLabel}
          </button>
        </section>

        <p className="rounded-xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-500">
          Đây là bản thử nghiệm: đơn hàng được lưu để kiểm tra, <strong>chưa chuyển cho bên giao hàng</strong> và
          không phát sinh thanh toán.
        </p>
      </aside>

      {/* Thanh đặt hàng cố định trên điện thoại */}
      <div
        data-bottom-bar="checkout"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-neutral-500">Tổng cộng</p>
            <p className="font-semibold text-brand-600">{quote ? formatVND(quote.total) : "…"}</p>
          </div>
          <button
            type="submit"
            form="checkout-form"
            disabled={!canSubmit}
            aria-busy={submitting}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 text-sm font-semibold text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ariaFor(field: CustomerField, error: string | undefined, hasHint = false) {
  const describedBy = [error ? `${fieldId(field)}-error` : null, hasHint ? `${fieldId(field)}-hint` : null]
    .filter(Boolean)
    .join(" ");
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  } as const;
}

function inputClass(error: string | undefined) {
  return `w-full rounded-xl border bg-white px-3.5 py-2.5 text-base outline-none placeholder:text-neutral-400 sm:text-sm ${
    error
      ? "border-brand-500 focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
      : "border-neutral-300 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-100"
  }`;
}

function Field({
  field,
  required = false,
  error,
  hint,
  children,
}: {
  field: CustomerField;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId(field)} className="block text-sm font-medium">
        {FIELD_LABELS[field]}
        {required ? (
          <span className="text-brand-600"> *</span>
        ) : (
          <span className="font-normal text-neutral-400"> (không bắt buộc)</span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${fieldId(field)}-hint`} className="text-xs text-neutral-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fieldId(field)}-error`} className="flex items-start gap-1.5 text-sm text-brand-600">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
