import { STATUS_LABELS, STATUS_STYLES, type OrderStatus } from "@/lib/order-status";

export function StatusBadge({ status, className = "" }: { status: OrderStatus; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${STATUS_STYLES[status]} ${className}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
