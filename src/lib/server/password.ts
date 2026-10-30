/**
 * Băm mật khẩu bằng scrypt (node:crypto). Module thuần, dùng chung cho
 * ứng dụng và script thiết lập tài khoản. Định dạng lưu:
 *   scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 128 * N * R * 2;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEM });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const options = { N: Number(n), r: Number(r), p: Number(p), maxmem: 128 * Number(n) * Number(r) * 2 };
  const actual = await scryptAsync(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, options);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Trả về thông báo lỗi tiếng Việt, hoặc null nếu mật khẩu đạt yêu cầu. */
export function checkPasswordPolicy(password: string, username: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự.`;
  if (new Set(password).size < 4) return "Mật khẩu quá đơn giản (cần ít nhất 4 ký tự khác nhau).";
  if (password.toLowerCase().includes(username.toLowerCase())) return "Mật khẩu không được chứa tên đăng nhập.";
  return null;
}

export const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;
