/**
 * Kiểm tra thông tin người nhận. Dùng chung cho trình duyệt (báo lỗi ngay)
 * và server (kiểm tra lại, không tin dữ liệu gửi lên).
 */

export type CustomerInput = {
  name: string;
  phone: string;
  address: string;
  note: string;
};

export type CustomerField = keyof CustomerInput;
export type FieldErrors = Partial<Record<CustomerField, string>>;

export const CUSTOMER_LIMITS = {
  name: { min: 2, max: 100 },
  address: { min: 10, max: 300 },
  note: { max: 500 },
} as const;

/** Bỏ ký tự điều khiển và gộp khoảng trắng. */
function clean(value: unknown, multiline = false): string {
  if (typeof value !== "string") return "";
  const withoutControl = value.replace(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, " ");
  return multiline
    ? withoutControl
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : withoutControl.replace(/\s+/g, " ").trim();
}

/** "+84 912.345.678" -> "0912345678" */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+84")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("84") && digits.length === 11) digits = `0${digits.slice(2)}`;
  return digits;
}

const VN_MOBILE = /^0[35789]\d{8}$/;

export function validateCustomer(
  input: unknown,
): { ok: true; value: CustomerInput } | { ok: false; errors: FieldErrors } {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const name = clean(raw.name);
  const phone = normalizePhone(clean(raw.phone));
  const address = clean(raw.address, true);
  const note = clean(raw.note, true);
  const errors: FieldErrors = {};

  if (!name) errors.name = "Vui lòng nhập họ và tên người nhận.";
  else if (name.length < CUSTOMER_LIMITS.name.min) errors.name = "Họ và tên cần ít nhất 2 ký tự.";
  else if (name.length > CUSTOMER_LIMITS.name.max) errors.name = "Họ và tên tối đa 100 ký tự.";
  else if (!/\p{L}/u.test(name)) errors.name = "Họ và tên phải có chữ cái.";

  if (!phone) errors.phone = "Vui lòng nhập số điện thoại.";
  else if (!VN_MOBILE.test(phone))
    errors.phone =
      "Số điện thoại chưa đúng. Nhập 10 chữ số, bắt đầu bằng 03, 05, 07, 08 hoặc 09 (VD: 0912 345 678).";

  if (!address) errors.address = "Vui lòng nhập địa chỉ nhận hàng.";
  else if (address.length < CUSTOMER_LIMITS.address.min)
    errors.address = "Địa chỉ quá ngắn. Hãy ghi rõ số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố.";
  else if (address.length > CUSTOMER_LIMITS.address.max) errors.address = "Địa chỉ tối đa 300 ký tự.";

  if (note.length > CUSTOMER_LIMITS.note.max) errors.note = "Ghi chú tối đa 500 ký tự.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, phone, address, note } };
}
