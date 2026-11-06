import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Banknote, CheckCircle2, LockKeyhole, MapPin } from "lucide-react";
import { ProductImage } from "@/components/product/product-image";
import { StatusBadge } from "@/components/ui/status-badge";
import { siteConfig } from "@/config/site";
import { formatVND } from "@/lib/format";
import { getSiteSettings } from "@/lib/server/site-content";
import {
  ORDER_ACCESS_COOKIE_PREFIX,
  ORDER_CODE_PATTERN,
  getOrderByCode,
  verifyOrderAccessToken,
  type StoredOrder,
} from "@/lib/server/orders";

export const metadata: Metadata = {
  title: "Đơn hàng",
  robots: { index: false, follow: false },
};

type Props = PageProps<"/don-hang/[ma]">;

export default function OrderPage({ params }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 sm:pt-10">
      <Suspense fallback={<OrderSkeleton />}>
        <OrderContent params={params} />
      </Suspense>
    </div>
  );
}

function OrderSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Đang tải đơn hàng">
      <div className="mx-auto size-14 animate-pulse rounded-full bg-neutral-100" />
      <div className="mx-auto h-7 w-64 animate-pulse rounded bg-neutral-100" />
      <div className="h-48 animate-pulse rounded-2xl bg-neutral-100" />
    </div>
  );
}

async function OrderContent({ params }: Pick<Props, "params">) {
  const { ma } = await params;
  const code = decodeURIComponent(ma).toUpperCase();

  // Chỉ trình duyệt đã đặt đơn (có cookie hợp lệ) mới xem được.
  // Dù mã sai hay thiếu quyền, đều hiện cùng một thông báo để không lộ đơn nào tồn tại.
  let order: StoredOrder | null = null;
  if (ORDER_CODE_PATTERN.test(code)) {
    const token = (await cookies()).get(`${ORDER_ACCESS_COOKIE_PREFIX}${code}`)?.value;
    if (verifyOrderAccessToken(code, token)) order = getOrderByCode(code);
  }

  if (!order) return <OrderUnavailable />;
  return <OrderDetail order={order} brandName={(await getSiteSettings()).brandName} />;
}

function OrderUnavailable() {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-neutral-100">
        <LockKeyhole className="size-6 text-neutral-500" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">Không thể hiển thị đơn hàng</h1>
      <p className="max-w-md text-sm text-neutral-500">
        Mã đơn không đúng, hoặc đơn được đặt từ trình duyệt khác. Để bảo vệ thông tin người mua,
        đơn hàng chỉ xem được trên trình duyệt đã đặt.
      </p>
      <Link
        href="/"
        className="inline-flex h-11 items-center rounded-full bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-800"
      >
        Về trang chủ
      </Link>
    </div>
  );
}

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function OrderDetail({ order, brandName }: { order: StoredOrder; brandName: string }) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="size-8 text-emerald-600" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Đặt hàng thành công</h1>
        <p className="text-sm text-neutral-500">
          Mã đơn hàng{" "}
          <span className="rounded-lg bg-neutral-100 px-2 py-1 font-mono text-base font-semibold text-neutral-900">
            {order.code}
          </span>
        </p>
        <p className="text-xs text-neutral-500">Đặt lúc {dateFormatter.format(new Date(order.createdAt))}</p>
        <p className="flex items-center gap-2 text-sm text-neutral-600">
          Trạng thái: <StatusBadge status={order.status} />
        </p>
      </div>

      {order.status === "cho_xac_nhan" && (
        <div role="note" className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Cảm ơn bạn đã đặt hàng</p>
            <p className="mt-0.5">
              Đơn đang chờ xác nhận. {brandName} có thể liên hệ qua số điện thoại bạn cung
              cấp để xác nhận đơn. Bạn thanh toán khi nhận hàng (COD).
            </p>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-neutral-200 p-4 sm:p-5">
        <h2 className="mb-3 font-semibold">Sản phẩm ({itemCount})</h2>
        <ul className="divide-y divide-neutral-100">
          {order.items.map((item, index) => (
            <li key={`${item.productId}-${index}`} className="flex gap-3 py-3 first:pt-0">
              <ProductImage image={item.image} label={item.name} className="w-14 shrink-0 rounded-lg" iconClassName="size-6" />
              <div className="min-w-0 flex-1 text-sm">
                <Link href={`/san-pham/${item.slug}`} className="line-clamp-2 font-medium hover:underline">
                  {item.name}
                </Link>
                {Object.keys(item.options).length > 0 && (
                  <p className="text-xs text-neutral-500">
                    {Object.entries(item.options)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </p>
                )}
                <p className="text-xs text-neutral-500">
                  {formatVND(item.unitPrice)} × {item.quantity}
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
            <dt>Tổng cộng</dt>
            <dd className="text-brand-600">{formatVND(order.total)}</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 p-4 text-sm sm:p-5">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <MapPin className="size-4 text-neutral-500" aria-hidden /> Người nhận
          </h2>
          <p className="font-medium">{order.customerName}</p>
          <p className="text-neutral-600">{order.phone}</p>
          <p className="whitespace-pre-line text-neutral-600">{order.address}</p>
          {order.note && (
            <p className="mt-2 whitespace-pre-line text-neutral-500">
              <span className="font-medium text-neutral-700">Ghi chú:</span> {order.note}
            </p>
          )}
        </section>
        <section className="rounded-2xl border border-neutral-200 p-4 text-sm sm:p-5">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <Banknote className="size-4 text-neutral-500" aria-hidden /> Thanh toán
          </h2>
          <p>Thanh toán khi nhận hàng (COD)</p>
          <p className="mt-1 text-neutral-500">Số tiền cần thanh toán: {formatVND(order.total)}</p>
        </section>
      </div>

      <div className="flex justify-center">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-full bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Tiếp tục mua sắm
        </Link>
      </div>
    </div>
  );
}
