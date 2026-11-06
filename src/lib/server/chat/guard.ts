/**
 * Chống spam và kiểm soát chi phí cho chatbot — mọi kiểm tra chạy TRƯỚC khi gọi OpenAI, trong giao dịch
 * SQLite (BEGIN IMMEDIATE) nên an toàn khi Passenger chạy nhiều tiến trình.
 * Không lưu IP gốc hay nội dung câu hỏi: chỉ HMAC (có khoá bí mật) và bộ đếm có hạn.
 */
import "server-only";
import { createHmac } from "node:crypto";
import { getDb, withTransaction } from "@/lib/server/db";
import { CHAT_LIMITS, CHAT_TEST_TOTAL_CAP_USD, chatConfig, chatHmacSecret, webSearchesPerDay } from "@/lib/server/chat/config";
import type { DatabaseSync } from "node:sqlite";

export const hmac = (kind: string, value: string) => createHmac("sha256", chatHmacSecret()).update(`${kind}:${value}`).digest("base64url").slice(0, 32);

/** Ngày theo giờ Việt Nam (UTC+7, không có giờ mùa hè). */
export function vnDay(nowMs = Date.now()): string {
  return new Date(nowMs + 7 * 3600_000).toISOString().slice(0, 10);
}
const vnDayEndMs = (nowMs: number) => Date.parse(`${vnDay(nowMs)}T00:00:00Z`) - 7 * 3600_000 + 86_400_000;

function bump(db: DatabaseSync, bucket: string, subject: string, window: number, expiresAt: number) {
  db.prepare(
    `INSERT INTO chat_rate (bucket, subject, window, count, expires_at) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(bucket, subject, window) DO UPDATE SET count = count + 1`,
  ).run(bucket, subject, window, expiresAt);
}
function count(db: DatabaseSync, bucket: string, subject: string, window: number): number {
  return (db.prepare("SELECT count FROM chat_rate WHERE bucket = ? AND subject = ? AND window = ?").get(bucket, subject, window) as { count: number } | undefined)?.count ?? 0;
}
function stat(db: DatabaseSync, day: string, field: "blocked" | "errors" | "questions" | "quick_answers", n = 1) {
  db.prepare(
    `INSERT INTO chat_budget_daily (day, ${field}, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET ${field} = ${field} + excluded.${field}, updated_at = excluded.updated_at`,
  ).run(day, n, new Date().toISOString());
}

export type GateInput = {
  sessionId: string;
  newSession: boolean;
  /** null = không xác định được IP thật (bỏ qua giới hạn theo IP, chỉ còn giới hạn phiên). */
  ip: string | null;
  questionKey: string;
  captchaPassed: boolean;
  /** true = trả lời cố định từ dữ liệu website, không gọi AI (không cần khoá xử lý). */
  quick: boolean;
};
export type GateResult =
  | { ok: true; lock: string | null }
  | { ok: false; reason: "rate_session" | "rate_ip" | "rate_new_session" | "busy_session" | "busy_global" | "captcha"; retryAfterSec: number };

/**
 * Kiểm tra + ghi nhận một câu hỏi (nguyên tử). Lượt bị chặn KHÔNG được gọi OpenAI.
 * Thứ tự: hạn mức cứng → dấu hiệu bất thường (cần CAPTCHA) → ghi đếm → khoá phiên & giới hạn đồng thời.
 */
export function admitQuestion(g: GateInput, nowMs = Date.now()): GateResult {
  const L = CHAT_LIMITS;
  const sess = hmac("sess", g.sessionId);
  const ip = g.ip ? hmac("ip", g.ip) : null;
  const minute = Math.floor(nowMs / 60_000);
  const day = vnDay(nowMs);
  const dayEnd = vnDayEndMs(nowMs);
  const tenMin = Math.floor(nowMs / 600_000);
  const hour = Math.floor(nowMs / 3600_000);
  const dayNum = Number(day.replaceAll("-", ""));
  return withTransaction((db) => {
    db.prepare("DELETE FROM chat_rate WHERE expires_at < ?").run(nowMs);
    db.prepare("DELETE FROM chat_inflight WHERE expires_at < ?").run(nowMs);
    const block = (reason: Exclude<GateResult, { ok: true }>["reason"], retryAfterSec: number): GateResult => {
      stat(db, day, "blocked");
      return { ok: false, reason, retryAfterSec };
    };
    const secsToMinuteEnd = 60 - Math.floor((nowMs / 1000) % 60);
    const secsToDayEnd = Math.ceil((dayEnd - nowMs) / 1000);

    // 1. Hạn mức cứng.
    if (count(db, "sess_min", sess, minute) >= L.sessionPerMinute) return block("rate_session", secsToMinuteEnd);
    if (count(db, "sess_day", sess, dayNum) >= L.sessionPerDay) return block("rate_session", secsToDayEnd);
    if (ip) {
      if (count(db, "ip_min", ip, minute) >= L.ipPerMinute) return block("rate_ip", secsToMinuteEnd);
      if (count(db, "ip_day", ip, dayNum) >= L.ipPerDay) return block("rate_ip", secsToDayEnd);
      if (g.newSession && count(db, "ip_newsess", ip, hour) >= L.ipNewSessionsPerHour) return block("rate_new_session", 3600 - Math.floor((nowMs / 1000) % 3600));
    }

    // 2. Bất thường → CAPTCHA (đã qua CAPTCHA trong 30 phút gần đây thì thôi). Không áp cho câu trả lời cố định.
    const verified = count(db, "captcha_ok", sess, 0) > 0;
    if (g.captchaPassed && !verified) {
      db.prepare("INSERT OR REPLACE INTO chat_rate (bucket, subject, window, count, expires_at) VALUES ('captcha_ok', ?, 0, 1, ?)").run(sess, nowMs + L.captchaValidMs);
    }
    const suspicious =
      count(db, "sess_min", sess, minute) >= L.burstPerMinute ||
      count(db, "q_repeat", `${sess}:${g.questionKey}`, tenMin) >= L.repeatSameQuestion - 1 ||
      (ip !== null && count(db, "ip_min", ip, minute) >= L.ipBurstPerMinute);
    if (!g.quick && suspicious && !verified && !g.captchaPassed) return block("captcha", 0);

    // 3. Khoá: mỗi phiên một câu; giới hạn đồng thời toàn website.
    let lock: string | null = null;
    if (!g.quick) {
      if (db.prepare("SELECT 1 FROM chat_inflight WHERE subject = ?").get(sess)) return block("busy_session", 5);
      const active = (db.prepare("SELECT COUNT(*) n FROM chat_inflight").get() as { n: number }).n;
      if (active >= chatConfig().maxConcurrent) return block("busy_global", 10);
      db.prepare("INSERT INTO chat_inflight (subject, expires_at) VALUES (?, ?)").run(sess, nowMs + L.lockMs);
      lock = sess;
    }

    // 4. Ghi đếm (chỉ lượt được nhận).
    bump(db, "sess_min", sess, minute, nowMs + 120_000);
    bump(db, "sess_day", sess, dayNum, dayEnd + 3600_000);
    bump(db, "q_repeat", `${sess}:${g.questionKey}`, tenMin, nowMs + 1_200_000);
    if (ip) {
      bump(db, "ip_min", ip, minute, nowMs + 120_000);
      bump(db, "ip_day", ip, dayNum, dayEnd + 3600_000);
      if (g.newSession) bump(db, "ip_newsess", ip, hour, nowMs + 7_200_000);
    }
    stat(db, day, g.quick ? "quick_answers" : "questions");
    return { ok: true, lock };
  });
}

export function releaseLock(lock: string | null) {
  if (!lock) return;
  withTransaction((db) => db.prepare("DELETE FROM chat_inflight WHERE subject = ?").run(lock));
}

export function recordError() {
  withTransaction((db) => stat(db, vnDay(), "errors"));
}

// ───────────── Ngân sách (giữ trước rồi đối soát) ─────────────

const toMicro = (usd: number) => Math.ceil(usd * 1_000_000);
export function costMicro(inputTokens: number, cachedTokens: number, outputTokens: number): number {
  const c = chatConfig();
  const fresh = Math.max(0, inputTokens - cachedTokens);
  return toMicro((fresh * c.priceInput + cachedTokens * c.priceCachedInput + outputTokens * c.priceOutput) / 1_000_000);
}

/**
 * Giữ trước chi phí TỐI ĐA của một lần gọi (đầu vào ước tính + đầu ra tối đa). Vượt ngân sách ngày → false,
 * không gọi API. Mọi lần gọi trong lượt hỏi (kể cả vòng gọi công cụ) đều phải giữ trước.
 */
export function reserveBudget(estimateMicro: number, nowMs = Date.now()): { day: string; micro: number } | null {
  const day = vnDay(nowMs);
  const cfg = chatConfig();
  const budget = toMicro(cfg.dailyBudgetUsd);
  return withTransaction((db) => {
    const row = db.prepare("SELECT reserved_micro, spent_micro FROM chat_budget_daily WHERE day = ?").get(day) as
      | { reserved_micro: number; spent_micro: number }
      | undefined;
    if ((row?.spent_micro ?? 0) + (row?.reserved_micro ?? 0) + estimateMicro > budget) return null;
    // Chế độ thử không cần IP: trần tổng cộng dồn MỌI ngày (bảng ngân sách không bao giờ bị xoá).
    if (cfg.noIpTest && lifetimeMicro(db) + estimateMicro > toMicro(CHAT_TEST_TOTAL_CAP_USD)) return null;
    db.prepare(
      `INSERT INTO chat_budget_daily (day, reserved_micro, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET reserved_micro = reserved_micro + excluded.reserved_micro, updated_at = excluded.updated_at`,
    ).run(day, estimateMicro, new Date().toISOString());
    return { day, micro: estimateMicro };
  });
}

/**
 * Đối soát sau khi gọi: bỏ phần giữ trước, cộng chi phí thực tế theo usage. Không nhận được usage
 * (hết thời gian, lỗi mạng giữa chừng) → tính TOÀN BỘ phần đã giữ trước (an toàn, không bao giờ tính thiếu).
 */
export function settleBudget(r: { day: string; micro: number }, usage: { input: number; cached: number; output: number; searches?: number } | null) {
  // Có usage: chi phí token thực tế + phí từng lần tìm web thực tế. Không có usage: tính đủ phần giữ trước.
  const actual = usage ? costMicro(usage.input, usage.cached, usage.output) + (usage.searches ?? 0) * CHAT_LIMITS.webSearchFeeMicro : r.micro;
  withTransaction((db) => {
    db.prepare(
      `UPDATE chat_budget_daily SET reserved_micro = MAX(reserved_micro - ?, 0), spent_micro = spent_micro + ?, api_calls = api_calls + 1,
         input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, updated_at = ? WHERE day = ?`,
    ).run(r.micro, actual, usage?.input ?? 0, usage?.output ?? 0, new Date().toISOString(), r.day);
  });
}

// ───────────── Lượt tìm web (giữ trước rồi trả lại phần không dùng) ─────────────

const vnDayNumber = (nowMs: number) => Math.floor((nowMs + 7 * 3600_000) / 86_400_000);

/**
 * Giữ trước tối đa `want` lượt tìm web cho một câu hỏi, trong giới hạn của toàn website và của phiên trong ngày.
 * Trả về số lượt được phép (0 = không được tìm). Nguyên tử trong một giao dịch.
 */
export function reserveWebSearches(sessionId: string, want: number, nowMs = Date.now()): number {
  const day = vnDayNumber(nowMs);
  const exp = vnDayEndMs(nowMs) + 86_400_000;
  const sess = hmac("sess", sessionId);
  return withTransaction((db) => {
    const siteLeft = webSearchesPerDay() - count(db, "web_day", "site", day);
    const sessLeft = CHAT_LIMITS.webSearchesPerSessionDay - count(db, "web_sess", sess, day);
    const n = Math.max(0, Math.min(want, siteLeft, sessLeft));
    if (n > 0) {
      for (const [bucket, subject] of [["web_day", "site"], ["web_sess", sess]] as const) {
        db.prepare(
          `INSERT INTO chat_rate (bucket, subject, window, count, expires_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(bucket, subject, window) DO UPDATE SET count = count + excluded.count`,
        ).run(bucket, subject, day, n, exp);
      }
    }
    return n;
  });
}

/** Trả lại các lượt tìm đã giữ nhưng không dùng. */
export function releaseWebSearches(sessionId: string, n: number, nowMs = Date.now()) {
  if (n <= 0) return;
  const day = vnDayNumber(nowMs);
  const sess = hmac("sess", sessionId);
  withTransaction((db) => {
    for (const [bucket, subject] of [["web_day", "site"], ["web_sess", sess]] as const) {
      db.prepare("UPDATE chat_rate SET count = MAX(count - ?, 0) WHERE bucket = ? AND subject = ? AND window = ?").run(n, bucket, subject, day);
    }
  });
}

/** Số lần tìm web đã dùng hôm nay (toàn website). */
export function webSearchesToday(nowMs = Date.now()): number {
  return count(getDb(), "web_day", "site", vnDayNumber(nowMs));
}

export type ChatDayStats = {
  day: string;
  spentUsd: number;
  reservedUsd: number;
  budgetUsd: number;
  questions: number;
  quickAnswers: number;
  apiCalls: number;
  blocked: number;
  errors: number;
};
/** Tổng chi phí (đã chi + đang giữ trước) của mọi ngày, micro-USD. */
function lifetimeMicro(db: DatabaseSync): number {
  const r = db.prepare("SELECT COALESCE(SUM(spent_micro + reserved_micro), 0) AS n FROM chat_budget_daily").get() as { n: number };
  return r.n;
}

/** Tổng chi phí từ trước tới nay (USD) — dùng cho chế độ thử. */
export function lifetimeSpentUsd(): number {
  return lifetimeMicro(getDb()) / 1_000_000;
}

export function todayStats(nowMs = Date.now()): ChatDayStats {
  const day = vnDay(nowMs);
  const r = getDb().prepare("SELECT * FROM chat_budget_daily WHERE day = ?").get(day) as
    | { spent_micro: number; reserved_micro: number; questions: number; quick_answers: number; api_calls: number; blocked: number; errors: number }
    | undefined;
  return {
    day,
    spentUsd: (r?.spent_micro ?? 0) / 1_000_000,
    reservedUsd: (r?.reserved_micro ?? 0) / 1_000_000,
    budgetUsd: chatConfig().dailyBudgetUsd,
    questions: r?.questions ?? 0,
    quickAnswers: r?.quick_answers ?? 0,
    apiCalls: r?.api_calls ?? 0,
    blocked: r?.blocked ?? 0,
    errors: r?.errors ?? 0,
  };
}
