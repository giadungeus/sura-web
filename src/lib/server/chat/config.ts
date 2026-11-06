/**
 * Cấu hình chatbot tư vấn. Khoá API và các tham số chỉ đọc từ biến môi trường của MÁY CHỦ —
 * không bao giờ gửi xuống trình duyệt, không ghi log, không đưa vào CSDL.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { CHAT_PUBLIC_LIMITS } from "@/lib/chat-limits";
import { getDb } from "@/lib/server/db";

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function chatConfig() {
  const env = process.env;
  return {
    apiKey: env.OPENAI_API_KEY?.trim() || "",
    baseUrl: (env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, ""),
    model: env.CHAT_MODEL?.trim() || "gpt-6-luna",
    /** Giá USD / 1 triệu token (mặc định: gpt-6-luna, Standard — trang giá chính thức, đọc 02/11/2026). */
    priceInput: num(env.CHAT_PRICE_INPUT_PER_M, 0.1),
    priceCachedInput: num(env.CHAT_PRICE_CACHED_INPUT_PER_M, 0.01),
    priceOutput: num(env.CHAT_PRICE_OUTPUT_PER_M, 0.5),
    dailyBudgetUsd: num(env.CHAT_DAILY_BUDGET_USD, 1),
    maxConcurrent: Math.floor(num(env.CHAT_MAX_CONCURRENT, 3)),
    turnstileSiteKey: env.TURNSTILE_SITE_KEY?.trim() || "",
    turnstileSecret: env.TURNSTILE_SECRET_KEY?.trim() || "",
    turnstileVerifyUrl: env.TURNSTILE_VERIFY_URL?.trim() || "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    /**
     * Chế độ thử công khai khi hosting chưa có nguồn IP tin cậy: cho phép trả lời AI dù thiếu IP, nhưng KHÔNG tin
     * header IP nào (kể cả !~Passenger-Client-Address) — giới hạn theo IP bị bỏ qua. Bù lại có trần tổng chi phí
     * cộng dồn CHAT_TEST_TOTAL_CAP_USD cho toàn website (không đặt lại khi Restart hay sang ngày mới).
     */
    noIpTest: env.CHAT_ALLOW_NO_IP_TEST === "1",
  };
}

/** Trần tổng chi phí AI từ trước tới nay khi bật chế độ thử không cần IP (USD). Cố định, không đổi bằng biến môi trường. */
export const CHAT_TEST_TOTAL_CAP_USD = 0.1;

/** Giới hạn cố định (kiểm tra ở máy chủ). */
export const CHAT_LIMITS = {
  /** Câu hỏi 800 ký tự; lịch sử 12 tin / 8.000 ký tự — dùng chung với giao diện (src/lib/chat-limits.ts). */
  ...CHAT_PUBLIC_LIMITS,
  toolRounds: 3,
  /** Mỗi lần gọi tối đa 1.000 token đầu ra; phần giữ trước ngân sách tính theo đúng số này. */
  outputTokensPerCall: 1_000,
  /** Trần token cho TOÀN lượt hỏi (mọi vòng gọi cộng lại). */
  inputTokensPerQuestion: 40_000,
  outputTokensPerQuestion: 2_500,
  deadlineMs: 20_000,
  /** Lượt có khả năng tìm web: tra Sura + tìm web cần lâu hơn (giao diện chờ tối đa 60 giây). */
  deadlineWebMs: 45_000,
  /** Phiên: 5 câu/phút, 30 câu/ngày. */
  sessionPerMinute: 5,
  sessionPerDay: 30,
  /** IP (một mạng có thể có nhiều khách): 20 câu/phút, 150 câu/ngày, tối đa 10 phiên mới/giờ. */
  ipPerMinute: 20,
  ipPerDay: 150,
  ipNewSessionsPerHour: 10,
  /** Dấu hiệu bất thường → cần CAPTCHA: ≥3 câu trong cùng phút, hoặc cùng câu hỏi lần thứ 3 trong 10 phút, hoặc IP ≥10 câu/phút. */
  burstPerMinute: 3,
  repeatSameQuestion: 3,
  ipBurstPerMinute: 10,
  captchaValidMs: 30 * 60_000,
  /** Khoá phiên tự hết hạn (dài hơn thời hạn lượt có tìm web). */
  lockMs: 60_000,
  /** Tìm web (giai đoạn B): mỗi lượt hỏi tối đa 2 lần tìm; mỗi phiên 6 lần/ngày; toàn website mặc định 20 lần/ngày. */
  webSearchesPerQuestion: 2,
  webSearchesPerSessionDay: 6,
  /** Phí công cụ tìm web: 10 USD / 1.000 lần = 10.000 micro-USD mỗi lần (giá chính thức OpenAI, đọc 03/11/2026). */
  webSearchFeeMicro: 10_000,
  /** Ước tính token nội dung tìm được mỗi lần tìm (tính theo giá đầu vào của model) để giữ trước ngân sách. */
  webSearchContentTokensEstimate: 8_000,
} as const;

/** Số lần tìm web tối đa mỗi ngày (giờ VN) cho toàn website — CHAT_WEB_SEARCHES_PER_DAY, mặc định 20. */
export function webSearchesPerDay(): number {
  const n = Math.floor(Number(process.env.CHAT_WEB_SEARCHES_PER_DAY));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 500) : 20;
}

export const SETTING_CHATBOT_WEB_SEARCH = "chatbot_web_search";

/** Công tắc tìm web trong Quản trị (mặc định Tắt, độc lập với công tắc chatbot). */
export function isWebSearchSwitchOn(): boolean {
  const row = getDb().prepare("SELECT value FROM site_settings WHERE key = ?").get(SETTING_CHATBOT_WEB_SEARCH) as { value: string } | undefined;
  return row?.value === "1";
}

export function setWebSearchSwitch(on: boolean, username: string) {
  getDb()
    .prepare(
      `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .run(SETTING_CHATBOT_WEB_SEARCH, on ? "1" : "0", new Date().toISOString(), username);
}

export const SETTING_CHATBOT_ENABLED = "chatbot_enabled";

/** Công tắc trong Quản trị (mặc định Tắt). */
export function isChatbotSwitchOn(): boolean {
  const row = getDb().prepare("SELECT value FROM site_settings WHERE key = ?").get(SETTING_CHATBOT_ENABLED) as { value: string } | undefined;
  return row?.value === "1";
}

export function setChatbotSwitch(on: boolean, username: string) {
  getDb()
    .prepare(
      `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .run(SETTING_CHATBOT_ENABLED, on ? "1" : "0", new Date().toISOString(), username);
}

/** Chatbot chạy khi: công tắc Bật VÀ có khoá API. */
export function chatbotActive(): boolean {
  return isChatbotSwitchOn() && chatConfig().apiKey !== "";
}

/** Khoá bí mật cho HMAC phiên/IP: lấy từ CHAT_HMAC_SECRET, không có thì tạo ngẫu nhiên một lần trong app_settings. */
export function chatHmacSecret(): string {
  const fromEnv = process.env.CHAT_HMAC_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const db = getDb();
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'chat_hmac_secret'").get() as { value: string } | undefined;
  if (row) return row.value;
  db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('chat_hmac_secret', ?)").run(randomBytes(32).toString("hex"));
  return (db.prepare("SELECT value FROM app_settings WHERE key = 'chat_hmac_secret'").get() as { value: string }).value;
}
