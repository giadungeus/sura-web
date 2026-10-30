const vndFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("vi-VN");

/** 12990000 -> "12.990.000 ₫" */
export function formatVND(amount: number): string {
  return vndFormatter.format(amount);
}

/** 12800 -> "12,8k"; 950 -> "950" */
export function formatSold(count: number): string {
  if (count >= 1000) {
    const k = Math.floor(count / 100) / 10;
    return `${numberFormatter.format(k)}k`;
  }
  return numberFormatter.format(count);
}

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** ISO -> "14:05 30/10/2026" theo giờ Việt Nam. */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Phần trăm giảm giá, làm tròn; trả về 0 nếu không giảm. */
export function discountPercent(price: number, originalPrice?: number): number {
  if (!originalPrice || originalPrice <= price) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}
