import { Suspense } from "react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronRight as Arrow, Inbox, Search } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime, formatVND } from "@/lib/format";
import { ORDER_STATUSES, PENDING_DESCRIPTION, STATUS_LABELS, isOrderStatus, type OrderStatus } from "@/lib/order-status";
import { requireAdmin } from "@/lib/server/admin-auth";
import { countOrdersByStatus, countPendingOrders, listAdminOrders } from "@/lib/server/admin-orders";

export const metadata: Metadata = { title: "Đơn hàng" };

type SearchParams = Record<string, string | string[] | undefined>;

export default function AdminOrdersPage({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <OrdersContent searchParams={searchParams} />
    </Suspense>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Đang tải">
      <div className="h-8 w-40 animate-pulse rounded bg-neutral-200" />
      <div className="h-11 animate-pulse rounded-xl bg-neutral-200" />
      <div className="h-80 animate-pulse rounded-2xl bg-neutral-200" />
    </div>
  );
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function buildHref(params: { q?: string; status?: OrderStatus; page?: number }): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.status) sp.set("trang-thai", params.status);
  if (params.page && params.page > 1) sp.set("trang", String(params.page));
  const qs = sp.toString();
  return qs ? `/admin?${qs}` : "/admin";
}

async function OrdersContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim().slice(0, 50);
  const statusRaw = first(sp["trang-thai"]);
  const status = isOrderStatus(statusRaw) ? statusRaw : undefined;
  const pageRaw = Number.parseInt(first(sp.trang) ?? "1", 10);

  await requireAdmin(buildHref({ q, status, page: pageRaw }));

  // Danh sách, phân trang và số đếm trên nút lọc dùng cùng điều kiện lọc.
  const result = listAdminOrders({ q, status, page: Number.isFinite(pageRaw) ? pageRaw : 1 });
  const counts = countOrdersByStatus(q);
  const pending = countPendingOrders();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Đơn hàng</h1>
          <p className="text-sm text-neutral-500">
            {q || status ? `${result.total} đơn phù hợp` : `Tổng cộng ${counts.all} đơn`}
          </p>
        </div>
      </div>

      <section aria-label="Đơn chờ xử lý" className="max-w-xs rounded-2xl border border-neutral-200 bg-white p-3">
        <p className="text-2xl font-bold text-neutral-900">{pending}</p>
        <p className="text-sm font-medium text-neutral-700">Đơn chờ xử lý</p>
        <p className="mt-1 text-xs text-neutral-500">Gồm các trạng thái: {PENDING_DESCRIPTION}.</p>
      </section>

      <Form action="/admin" role="search" className="flex gap-2">
        {status && <input type="hidden" name="trang-thai" value={status} />}
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            name="q"
            type="search"
            defaultValue={q}
            key={q}
            maxLength={50}
            aria-label="Tìm theo mã đơn hoặc số điện thoại"
            placeholder="Tìm mã đơn hoặc số điện thoại"
            className="h-11 w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-10 text-base outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-100 sm:text-sm"
          />
        </div>
        <button
          type="submit"
          className="h-11 shrink-0 rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Tìm
        </button>
      </Form>


      <nav aria-label="Lọc theo trạng thái" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <FilterChip href={buildHref({ q })} active={!status} label="Tất cả" count={counts.all} />
        {ORDER_STATUSES.map((s) => (
          <FilterChip key={s} href={buildHref({ q, status: s })} active={status === s} label={STATUS_LABELS[s]} count={counts[s]} />
        ))}
      </nav>

      {q && (
        <p className="text-sm text-neutral-600">
          Kết quả cho “{q}”.{" "}
          <Link href={buildHref({ status })} className="font-medium underline underline-offset-4">
            Xoá tìm kiếm
          </Link>
        </p>
      )}

      {result.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center">
          <Inbox className="size-10 text-neutral-300" aria-hidden />
          <p className="font-medium">Không có đơn hàng phù hợp</p>
          <p className="text-sm text-neutral-500">Thử từ khoá khác hoặc bỏ bộ lọc trạng thái.</p>
        </div>
      ) : (
        <>
          {/* Máy tính: bảng */}
          <div className="hidden overflow-hidden rounded-2xl border border-neutral-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Mã đơn</th>
                  <th scope="col" className="px-4 py-3 font-medium">Thời gian</th>
                  <th scope="col" className="px-4 py-3 font-medium">Khách hàng</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Tổng tiền</th>
                  <th scope="col" className="px-4 py-3 font-medium">Trạng thái</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Xem</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {result.items.map((o) => (
                  <tr key={o.code} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-mono font-medium">
                      <Link href={`/admin/don-hang/${o.code}`} className="hover:underline">
                        {o.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-neutral-600">{formatDateTime(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{o.customerName}</p>
                      <p className="text-xs text-neutral-500">{o.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <p className="font-medium">{formatVND(o.total)}</p>
                      <p className="text-xs text-neutral-500">{o.itemCount} sản phẩm</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/don-hang/${o.code}`}
                        className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-900"
                      >
                        Chi tiết <Arrow className="size-4" aria-hidden />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Điện thoại: thẻ */}
          <ul className="space-y-3 md:hidden">
            {result.items.map((o) => (
              <li key={o.code}>
                <Link
                  href={`/admin/don-hang/${o.code}`}
                  className="block rounded-2xl border border-neutral-200 bg-white p-4 active:bg-neutral-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{o.code}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="mt-2 text-sm font-medium">{o.customerName}</p>
                  <p className="text-xs text-neutral-500">{o.phone}</p>
                  <div className="mt-2 flex items-end justify-between text-sm">
                    <span className="text-xs text-neutral-500">{formatDateTime(o.createdAt)}</span>
                    <span className="font-semibold">{formatVND(o.total)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {result.totalPages > 1 && (
        <nav aria-label="Phân trang" className="flex items-center justify-center gap-2 pt-2">
          <PageLink href={buildHref({ q, status, page: result.page - 1 })} disabled={result.page <= 1} label="Trang trước">
            <ChevronLeft className="size-4" aria-hidden />
          </PageLink>
          <span className="px-3 text-sm text-neutral-600">
            Trang {result.page} / {result.totalPages}
          </span>
          <PageLink
            href={buildHref({ q, status, page: result.page + 1 })}
            disabled={result.page >= result.totalPages}
            label="Trang sau"
          >
            <ChevronRight className="size-4" aria-hidden />
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function FilterChip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm whitespace-nowrap ${
        active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
      }`}
    >
      {label}
      <span className={`text-xs ${active ? "text-neutral-300" : "text-neutral-400"}`}>{count}</span>
    </Link>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  const cls = "inline-flex size-10 items-center justify-center rounded-full border border-neutral-200 bg-white";
  if (disabled) {
    return (
      <span className={`${cls} text-neutral-300`} aria-disabled="true" aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`${cls} hover:border-neutral-400`} aria-label={label}>
      {children}
    </Link>
  );
}
