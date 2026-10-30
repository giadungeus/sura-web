import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FlaskConical, Lock, MapPin, Phone, SearchX } from "lucide-react";
import { ProductImage } from "@/components/product/product-image";
import { StatusBadge } from "@/components/ui/status-badge";
import { siteConfig } from "@/config/site";
import { formatDateTime, formatVND } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/order-status";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getAdminOrder, type AdminOrderDetail } from "@/lib/server/admin-orders";
import { ORDER_CODE_PATTERN } from "@/lib/server/orders";
import { NoteForm } from "./note-form";
import { StatusPanel } from "./status-panel";

export const metadata: Metadata = { title: "Chi tiết đơn hàng" };

type Props = PageProps<"/admin/don-hang/[ma]">;

export default function AdminOrderPage({ params }: Props) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailContent params={params} />
    </Suspense>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Đang tải đơn hàng">
      <div className="h-5 w-32 animate-pulse rounded bg-neutral-200" />
      <div className="h-8 w-64 animate-pulse rounded bg-neutral-200" />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />
        <div className="h-64 animate-pulse rounded-2xl bg-neutral-200" />
      </div>
    </div>
  );
}

async function DetailContent({ params }: Pick<Props, "params">) {
  const { ma } = await params;
  const code = decodeURIComponent(ma).toUpperCase();
  await requireAdmin(ORDER_CODE_PATTERN.test(code) ? `/admin/don-hang/${code}` : "/admin");

  const order = ORDER_CODE_PATTERN.test(code) ? getAdminOrder(code) : null;
  if (!order) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
        <SearchX className="size-10 text-neutral-300" aria-hidden />
        <h1 className="font-semibold">Không tìm thấy đơn hàng</h1>
        <p className="text-sm text-neutral-500">Mã đơn “{code.slice(0, 30)}” không tồn tại.</p>
        <Link href="/admin" className="text-sm font-medium underline underline-offset-4">
          Về danh sách đơn
        </Link>
      </div>
    );
  }
  return <OrderDetail order={order} />;
}

function OrderDetail({ order }: { order: AdminOrderDetail }) {
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
          <ArrowLeft className="size-4" aria-hidden /> Danh sách đơn
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-xl font-bold tracking-tight sm:text-2xl">{order.code}</h1>
          <StatusBadge status={order.status} />
          {order.isTest && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 ring-inset">
              <FlaskConical className="size-3.5" aria-hidden /> Đơn thử nghiệm
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-500">
          Đặt lúc {formatDateTime(order.createdAt)} · Cập nhật {formatDateTime(order.updatedAt)} · Thanh toán khi
          nhận hàng (COD)
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="space-y-5">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
            <h2 className="mb-3 font-semibold">Sản phẩm ({itemCount})</h2>
            <ul className="divide-y divide-neutral-100">
              {order.items.map((item, index) => (
                <li key={`${item.productId}-${index}`} className="flex gap-3 py-3 first:pt-0">
                  <ProductImage image={item.image} label={item.name} className="w-14 shrink-0 rounded-lg" iconClassName="size-6" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-neutral-500">
                      {item.brand} · Mã SP {item.productId}
                    </p>
                    {Object.keys(item.options).length > 0 && (
                      <p className="mt-0.5 text-xs text-neutral-700">
                        {Object.entries(item.options)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" · ")}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Giá lúc đặt {formatVND(item.unitPrice)} × {item.quantity}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-medium">{formatVND(item.lineTotal)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1.5 border-t border-neutral-200 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Tạm tính</dt>
                <dd>{formatVND(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Phí vận chuyển</dt>
                <dd>{formatVND(order.shippingFee)}</dd>
              </div>
              {order.shippingFee === 0 && <p className="text-xs text-emerald-700">{siteConfig.shipping.label}</p>}
              <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold">
                <dt>Tổng cộng (thu khi giao)</dt>
                <dd className="text-brand-600">{formatVND(order.total)}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm sm:p-5">
            <h2 className="mb-3 font-semibold">Khách hàng</h2>
            <p className="font-medium">{order.customerName}</p>
            <p className="mt-1 flex items-center gap-2 text-neutral-700">
              <Phone className="size-4 text-neutral-400" aria-hidden />
              <a href={`tel:${order.phone}`} className="underline-offset-4 hover:underline">
                {order.phone}
              </a>
            </p>
            <p className="mt-1 flex gap-2 text-neutral-700">
              <MapPin className="mt-0.5 size-4 shrink-0 text-neutral-400" aria-hidden />
              <span className="whitespace-pre-line">{order.address}</span>
            </p>
            <div className="mt-3 rounded-xl bg-neutral-50 p-3">
              <p className="text-xs font-medium text-neutral-500">Ghi chú của khách</p>
              <p className="mt-0.5 whitespace-pre-line text-neutral-800">{order.note || "(không có)"}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
            <h2 className="mb-3 font-semibold">Lịch sử trạng thái</h2>
            <ol className="relative space-y-4 border-l border-neutral-200 pl-5">
              {order.history.map((h, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-neutral-400 ring-4 ring-white" aria-hidden />
                  <p>
                    {h.fromStatus ? (
                      <>
                        {STATUS_LABELS[h.fromStatus]} → <span className="font-medium">{STATUS_LABELS[h.toStatus]}</span>
                      </>
                    ) : (
                      <span className="font-medium">{STATUS_LABELS[h.toStatus]}</span>
                    )}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {formatDateTime(h.createdAt)} · {h.adminUsername ? `bởi ${h.adminUsername}` : "hệ thống"}
                  </p>
                  {h.reason && (
                    <p className="mt-1 whitespace-pre-line text-neutral-700">
                      {h.toStatus === "da_huy" ? `Lý do huỷ: ${h.reason}` : h.reason}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-5 lg:sticky lg:top-20">
          <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
            <h2 className="mb-3 font-semibold">Xử lý đơn</h2>
            <StatusPanel code={order.code} status={order.status} />
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Lock className="size-4 text-neutral-400" aria-hidden /> Ghi chú nội bộ
            </h2>
            <p className="mt-0.5 mb-3 text-xs text-neutral-500">Chỉ quản trị viên thấy, không hiển thị cho khách.</p>
            <NoteForm code={order.code} />
            {order.internalNotes.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {order.internalNotes.map((n, i) => (
                  <li key={i} className="rounded-xl bg-neutral-50 p-3 text-sm">
                    <p className="whitespace-pre-line text-neutral-800">{n.body}</p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {n.adminUsername} · {formatDateTime(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-neutral-400">Chưa có ghi chú.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
