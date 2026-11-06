/**
 * Cài đặt website sửa trong quản trị (lưu ở bảng site_settings). Module thuần: dùng chung
 * cho server, trình duyệt (xem trước) và bước khởi tạo dữ liệu.
 *
 * Phí giao hàng và phương thức thanh toán KHÔNG nằm ở đây: chúng gắn với logic tính tiền
 * đơn hàng (src/config/site.ts + src/lib/server/pricing.ts), không sửa bằng chữ.
 */

export type SiteSettings = {
  brandName: string;
  companyName: string;
  hotline: string;
  zalo: string;
  email: string;
  address: string;
  supportHours: string;
  footerDescription: string;
};

export const SETTING_KEYS = [
  "brandName",
  "companyName",
  "hotline",
  "zalo",
  "email",
  "address",
  "supportHours",
  "footerDescription",
] as const satisfies readonly (keyof SiteSettings)[];

/** Thông tin đã được xác nhận — chỉ dùng để khởi tạo khi CSDL chưa có giá trị. */
export const DEFAULT_SETTINGS: SiteSettings = {
  brandName: "Sura",
  companyName: "Công ty Ricotech",
  hotline: "0969 605 196",
  zalo: "0969605196",
  email: "ricotech.vn@gmail.com",
  address: "987 Tam Trinh, Hoàng Mai, Hà Nội",
  supportHours: "",
  footerDescription: "Website mua sắm đa ngành do Công ty Ricotech vận hành.",
};

export const SETTING_LIMITS: Record<keyof SiteSettings, number> = {
  brandName: 60,
  companyName: 120,
  hotline: 30,
  zalo: 200,
  email: 120,
  address: 200,
  supportHours: 120,
  footerDescription: 300,
};

export type SettingErrors = Partial<Record<keyof SiteSettings, string>>;

const clean = (v: unknown) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";

/** Chỉ còn chữ số; +84/84 → 0. Trả về "" nếu không hợp lệ. */
export function phoneDigits(raw: string): string {
  let d = raw.replace(/[\s.\-()]/g, "");
  if (d.startsWith("+84")) d = "0" + d.slice(3);
  if (!/^\d+$/.test(d)) return "";
  if (/^0\d{9,10}$/.test(d) || /^1[89]00\d{4,6}$/.test(d)) return d;
  return "";
}

export function phoneHref(hotline: string): string | null {
  const d = phoneDigits(hotline);
  if (!d) return null;
  return d.startsWith("0") ? `tel:+84${d.slice(1)}` : `tel:${d}`;
}

/** Zalo nhập dạng số điện thoại hoặc link https://zalo.me/... */
export function zaloHref(zalo: string): string | null {
  const v = zalo.trim();
  if (!v) return null;
  const d = phoneDigits(v);
  if (d) return `https://zalo.me/${d}`;
  try {
    const u = new URL(v);
    if (u.protocol === "https:" && (u.hostname === "zalo.me" || u.hostname.endsWith(".zalo.me"))) return u.toString();
  } catch {}
  return null;
}

export const emailHref = (email: string) => (email ? `mailto:${email}` : null);

export function validateSettings(input: Record<string, unknown>): { ok: true; value: SiteSettings } | { ok: false; errors: SettingErrors } {
  const value = Object.fromEntries(SETTING_KEYS.map((k) => [k, clean(input[k])])) as SiteSettings;
  const errors: SettingErrors = {};
  for (const k of SETTING_KEYS) {
    if (value[k].length > SETTING_LIMITS[k]) errors[k] = `Tối đa ${SETTING_LIMITS[k]} ký tự.`;
  }
  if (!value.brandName) errors.brandName = "Vui lòng nhập tên thương hiệu.";
  if (value.hotline && !phoneDigits(value.hotline))
    errors.hotline = "Số điện thoại chưa đúng (vd. 0969 605 196 hoặc 1900 xxxx).";
  if (value.zalo && !zaloHref(value.zalo)) errors.zalo = "Nhập số điện thoại Zalo hoặc link https://zalo.me/…";
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email)) errors.email = "Email chưa đúng.";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Thông tin liên hệ đã tính sẵn liên kết (dùng ở header, footer, nút hỗ trợ, trang Liên hệ). */
export type PublicSettings = SiteSettings & {
  phoneHref: string | null;
  zaloHref: string | null;
  emailHref: string | null;
};

export function toPublicSettings(s: SiteSettings): PublicSettings {
  return { ...s, phoneHref: phoneHref(s.hotline), zaloHref: zaloHref(s.zalo), emailHref: emailHref(s.email) };
}

/** Biến dùng được trong nội dung trang: viết {ten_bien} trong trình soạn thảo. */
export function contentVariables(s: PublicSettings): Record<string, string> {
  return {
    thuong_hieu: s.brandName,
    don_vi: s.companyName,
    hotline: s.hotline,
    hotline_link: s.phoneHref ?? "",
    zalo_link: s.zaloHref ?? "",
    email: s.email,
    email_link: s.emailHref ?? "",
    dia_chi: s.address,
    gio_ho_tro: s.supportHours,
  };
}

export const CONTENT_VARIABLE_HELP: { name: string; label: string }[] = [
  { name: "thuong_hieu", label: "Tên thương hiệu" },
  { name: "don_vi", label: "Đơn vị vận hành" },
  { name: "hotline", label: "Hotline (chữ)" },
  { name: "hotline_link", label: "Liên kết gọi điện" },
  { name: "zalo_link", label: "Liên kết Zalo" },
  { name: "email", label: "Email (chữ)" },
  { name: "email_link", label: "Liên kết gửi email" },
  { name: "dia_chi", label: "Địa chỉ" },
  { name: "gio_ho_tro", label: "Giờ hỗ trợ" },
];
