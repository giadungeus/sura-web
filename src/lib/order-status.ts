/** Trạng thái đơn hàng và luồng chuyển hợp lệ (dùng chung client và server). */

export const ORDER_STATUSES = ["cho_xac_nhan", "da_xac_nhan", "dang_giao", "hoan_thanh", "da_huy"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  cho_xac_nhan: "Chờ xác nhận",
  da_xac_nhan: "Đã xác nhận",
  dang_giao: "Đang giao",
  hoan_thanh: "Hoàn thành",
  da_huy: "Đã huỷ",
};

export const STATUS_STYLES: Record<OrderStatus, string> = {
  cho_xac_nhan: "bg-amber-50 text-amber-800 ring-amber-200",
  da_xac_nhan: "bg-sky-50 text-sky-800 ring-sky-200",
  dang_giao: "bg-violet-50 text-violet-800 ring-violet-200",
  hoan_thanh: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  da_huy: "bg-neutral-100 text-neutral-600 ring-neutral-200",
};

/** Bước tiếp theo trong luồng chính: Chờ xác nhận → Đã xác nhận → Đang giao → Hoàn thành. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  cho_xac_nhan: "da_xac_nhan",
  da_xac_nhan: "dang_giao",
  dang_giao: "hoan_thanh",
};

/** Chỉ được huỷ trước khi giao. */
export const CANCELLABLE: ReadonlySet<OrderStatus> = new Set(["cho_xac_nhan", "da_xac_nhan"]);

/** “Đơn chờ xử lý” = các đơn chưa hoàn thành và chưa huỷ. */
export const PENDING_STATUSES = ["cho_xac_nhan", "da_xac_nhan", "dang_giao"] as const satisfies readonly OrderStatus[];
export const PENDING_DESCRIPTION = "Chờ xác nhận, Đã xác nhận, Đang giao";

export const CANCEL_REASON_LIMITS = { min: 5, max: 500 } as const;
export const INTERNAL_NOTE_MAX = 1000;

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (to === "da_huy") return CANCELLABLE.has(from);
  return NEXT_STATUS[from] === to;
}

export function isFinalStatus(status: OrderStatus): boolean {
  return status === "hoan_thanh" || status === "da_huy";
}
