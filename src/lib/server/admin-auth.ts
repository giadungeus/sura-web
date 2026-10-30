import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, withTransaction } from "@/lib/server/db";
import { hashPassword, verifyPassword } from "@/lib/server/password";

// ───────────── Cấu hình ─────────────

export const ADMIN_SESSION_COOKIE = "admin_session";
/** Phiên hết hạn tuyệt đối sau 8 giờ kể từ lúc đăng nhập. */
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
/** Phiên hết hạn nếu không thao tác trong 2 giờ. */
const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
/** Chỉ ghi lại thời điểm hoạt động tối đa mỗi phút một lần. */
const TOUCH_INTERVAL_MS = 60 * 1000;

/** Khoá đăng nhập 15 phút sau 5 lần sai cho cùng tên đăng nhập. */
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_USERNAME = 5;
/** Chặn dò nhiều tên đăng nhập: tối đa 20 lần sai (mọi tên) mỗi 15 phút. */
const MAX_FAILURES_GLOBAL = 20;

export const ADMIN_LOGIN_PATH = "/admin/dang-nhap";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export type AdminSession = { adminId: number; username: string; expiresAt: string };

// ───────────── Phiên đăng nhập ─────────────

/** Tạo phiên mới và đặt cookie. Chỉ gọi trong Server Action. */
export async function startAdminSession(adminId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_MAX_AGE_MS);
  const db = getDb();
  // Dọn phiên đã hết hạn.
  db.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").run(new Date(now).toISOString());
  db.prepare(
    "INSERT INTO admin_sessions (token_hash, admin_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(sha256(token), adminId, new Date(now).toISOString(), new Date(now).toISOString(), expiresAt.toISOString());

  (await cookies()).set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    // Bật `secure` khi chạy qua HTTPS (lúc triển khai thật).
    secure: false,
    path: "/admin",
    expires: expiresAt,
  });
}

/** Xoá phiên hiện tại (đăng xuất). Chỉ gọi trong Server Action. */
export async function endAdminSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(sha256(token));
  store.delete({ name: ADMIN_SESSION_COOKIE, path: "/admin" });
}

type SessionRow = {
  admin_id: number;
  username: string;
  last_seen_at: string;
  expires_at: string;
};

/**
 * Đọc và kiểm tra phiên từ cookie. Trả về null nếu không có, đã hết hạn
 * hoặc tài khoản đã bị thay đổi. Được ghi nhớ trong một request.
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;

  const db = getDb();
  const tokenHash = sha256(token);
  const row = db
    .prepare(
      `SELECT s.admin_id, a.username, s.last_seen_at, s.expires_at
       FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as SessionRow | undefined;
  if (!row) return null;

  const now = Date.now();
  const expired =
    Date.parse(row.expires_at) <= now || Date.parse(row.last_seen_at) + SESSION_IDLE_MS <= now;
  if (expired) {
    db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }
  if (now - Date.parse(row.last_seen_at) > TOUCH_INTERVAL_MS) {
    db.prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?").run(
      new Date(now).toISOString(),
      tokenHash,
    );
  }
  return { adminId: row.admin_id, username: row.username, expiresAt: row.expires_at };
});

/**
 * Bắt buộc đăng nhập cho trang quản trị. Chưa đăng nhập hoặc phiên hết hạn
 * thì chuyển về trang đăng nhập.
 */
export async function requireAdmin(returnTo = "/admin"): Promise<AdminSession> {
  const session = await getAdminSession();
  if (session) return session;
  const hadCookie = (await cookies()).has(ADMIN_SESSION_COOKIE);
  const params = new URLSearchParams({ tiep: returnTo });
  if (hadCookie) params.set("het-han", "1");
  redirect(`${ADMIN_LOGIN_PATH}?${params.toString()}`);
}

/** Chỉ cho phép quay về đường dẫn nội bộ của trang quản trị. */
export function safeAdminReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/admin";
  if (!/^\/admin(\/[A-Za-z0-9\-_/]*)?(\?[A-Za-z0-9\-_=&%.+]*)?$/.test(value)) return "/admin";
  if (value.startsWith(ADMIN_LOGIN_PATH)) return "/admin";
  return value;
}

// ───────────── Đăng nhập & giới hạn số lần thử ─────────────

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim().slice(0, 64);
}

/** Số phút còn bị khoá (0 = không bị khoá). */
function lockMinutesRemaining(username: string): number {
  const db = getDb();
  const since = new Date(Date.now() - LOCK_WINDOW_MS).toISOString();
  const perUser = db
    .prepare(
      `SELECT COUNT(*) AS n, MIN(attempted_at) AS first FROM login_attempts
       WHERE username = ? COLLATE NOCASE AND success = 0 AND attempted_at > ?`,
    )
    .get(username, since) as { n: number; first: string | null };
  const global = db
    .prepare(
      `SELECT COUNT(*) AS n, MIN(attempted_at) AS first FROM login_attempts
       WHERE success = 0 AND attempted_at > ?`,
    )
    .get(since) as { n: number; first: string | null };

  const hit =
    perUser.n >= MAX_FAILURES_PER_USERNAME ? perUser.first : global.n >= MAX_FAILURES_GLOBAL ? global.first : null;
  if (!hit) return 0;
  const unlockAt = Date.parse(hit) + LOCK_WINDOW_MS;
  return Math.max(1, Math.ceil((unlockAt - Date.now()) / 60000));
}

// Băm giả để thời gian phản hồi giống nhau dù tên đăng nhập không tồn tại.
let dummyHash: Promise<string> | null = null;

export type LoginOutcome =
  | { ok: true; adminId: number }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; minutes: number };

export async function attemptAdminLogin(usernameRaw: string, password: string): Promise<LoginOutcome> {
  const username = usernameRaw.trim().slice(0, 64);
  const ip = await clientIp();
  const db = getDb();

  const minutes = lockMinutesRemaining(username);
  if (minutes > 0) return { ok: false, reason: "locked", minutes };

  const admin = db
    .prepare("SELECT id, password_hash FROM admins WHERE username = ? COLLATE NOCASE")
    .get(username) as { id: number; password_hash: string } | undefined;

  let valid = false;
  if (admin) {
    valid = await verifyPassword(password, admin.password_hash);
  } else {
    dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
    await verifyPassword(password, await dummyHash);
  }

  withTransaction((tx) => {
    tx.prepare("DELETE FROM login_attempts WHERE attempted_at < ?").run(
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    );
    tx.prepare("INSERT INTO login_attempts (username, ip, success, attempted_at) VALUES (?, ?, ?, ?)").run(
      username || "(trống)",
      ip,
      valid ? 1 : 0,
      new Date().toISOString(),
    );
    // Đăng nhập đúng thì xoá các lần sai trước đó của tài khoản này.
    if (valid) tx.prepare("DELETE FROM login_attempts WHERE username = ? COLLATE NOCASE AND success = 0").run(username);
  });

  if (!valid || !admin) {
    const after = lockMinutesRemaining(username);
    return after > 0 ? { ok: false, reason: "locked", minutes: after } : { ok: false, reason: "invalid" };
  }
  return { ok: true, adminId: admin.id };
}

export function hasAnyAdmin(): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM admins LIMIT 1").get());
}
