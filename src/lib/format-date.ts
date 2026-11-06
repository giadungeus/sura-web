const dateFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "2026-10-30T08:00:00Z" → "30/10/2026" (giờ Việt Nam). */
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
/** "2026-10-30T08:00:00Z" → "15:00 30/10/2026" (giờ Việt Nam). */
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso));
