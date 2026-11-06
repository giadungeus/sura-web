/**
 * Chatbot tư vấn: POST /api/chat. Chỉ đọc dữ liệu công khai; khoá API chỉ dùng ở máy chủ.
 * Thứ tự: Origin → công tắc + khoá → kiểm tra dữ liệu gửi lên → CAPTCHA (nếu có) → chống spam/khoá (nguyên tử)
 * → trả lời nhanh (không AI) hoặc gọi AI (giữ trước ngân sách từng lần gọi) → mở khoá.
 */
import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { trimHistory } from "@/lib/chat-limits";
import { normalizeVietnamese } from "@/lib/search";
import { CHAT_LIMITS, chatConfig, chatbotActive, isWebSearchSwitchOn } from "@/lib/server/chat/config";
import { answerQuestion, type ChatTurn, type WebState } from "@/lib/server/chat/engine";
import { admitQuestion, hmac, releaseLock, releaseWebSearches, reserveWebSearches } from "@/lib/server/chat/guard";
import { policyPage } from "@/lib/server/chat/tools";
import { getSiteSettings } from "@/lib/server/site-content";

// Ghi một dòng khi mô-đun chatbot được nạp lần đầu trong tiến trình (không có IP/nội dung). Nếu dòng này xuất hiện
// sau mỗi khoảng nghỉ trong log hosting, nghĩa là máy chủ đã dừng và khởi động lại ứng dụng Node (khởi động lạnh).
console.log(`[chat] mô-đun chatbot sẵn sàng; tiến trình đã chạy ${process.uptime().toFixed(1)} giây`);

const COOKIE = "sura_chat";
const SID = /^[A-Za-z0-9_-]{32}$/;
const QUICK_TOPICS: Record<string, string> = { "giao-hang": "giao-hang", "doi-tra": "doi-tra", "bao-hanh": "bao-hanh", "thanh-toan": "thanh-toan" };

const MSG = {
  off: "Tư vấn tự động đang tạm tắt. Bạn vui lòng nhắn Zalo để được hỗ trợ.",
  invalid: "Câu hỏi không hợp lệ.",
  tooLong: `Câu hỏi tối đa ${CHAT_LIMITS.messageMax} ký tự.`,
  rate: "Bạn hỏi hơi nhiều trong thời gian ngắn. Vui lòng thử lại sau ít phút hoặc nhắn Zalo.",
  busySession: "Đang trả lời câu trước, bạn chờ chút nhé.",
  busyGlobal: "Hệ thống tư vấn đang bận. Bạn thử lại sau ít giây hoặc nhắn Zalo.",
  captchaOff: "Bạn hỏi hơi dồn dập. Vui lòng thử lại sau ít phút hoặc nhắn Zalo để được hỗ trợ ngay.",
  budget: "Tư vấn tự động đang tạm dừng. Bạn vui lòng nhắn Zalo để được hỗ trợ.",
  timeout: "Trả lời quá lâu nên đã dừng. Bạn thử hỏi ngắn hơn hoặc nhắn Zalo.",
  cancelled: "Đã huỷ câu hỏi.",
  api: "Tạm thời chưa tư vấn được. Bạn thử lại sau hoặc nhắn Zalo.",
  noip: "Tư vấn tự động chưa sẵn sàng cho kết nối của bạn. Bạn vui lòng nhắn Zalo để được hỗ trợ.",
} as const;

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

/**
 * IP thật do app.js gắn vào header nội bộ (lấy từ header bảo mật của Passenger hoặc socket; đã xoá header cùng tên
 * khách tự gửi). Không xác định → null: câu hỏi cần AI bị từ chối và chuyển Zalo, không chỉ dựa vào giới hạn phiên.
 */
function clientIp(req: NextRequest): string | null {
  const v = req.headers.get("x-sura-client-ip")?.trim() ?? "";
  return isIP(v) && v !== "127.0.0.1" && v !== "::1" ? v : null;
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function cleanHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns = raw
    .filter((t): t is { role: string; text: string } => !!t && typeof t === "object" && typeof (t as { text?: unknown }).text === "string")
    .filter((t) => t.role === "user" || t.role === "assistant")
    .map((t) => ({ role: t.role as ChatTurn["role"], text: t.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "") }));
  // Cùng quy tắc với giao diện: 12 tin, tổng 8.000 ký tự (bỏ tin cũ nhất trước), mỗi tin tối đa 800/4.000 ký tự.
  return trimHistory(turns);
}

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const cfg = chatConfig();
  if (!cfg.turnstileSecret || !token || token.length > 2048) return false;
  try {
    const form = new URLSearchParams({ secret: cfg.turnstileSecret, response: token });
    if (ip) form.set("remoteip", ip);
    const res = await fetch(cfg.turnstileVerifyUrl, { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ kind: "error", text: MSG.invalid }, 403);
  if (!chatbotActive()) return json({ kind: "off", text: MSG.off });

  const raw = await req.text();
  if (raw.length > 24_000) return json({ kind: "error", text: MSG.invalid }, 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ kind: "error", text: MSG.invalid }, 400);
  }
  const quick = typeof body.quick === "string" && body.quick in QUICK_TOPICS ? body.quick : null;
  const message = typeof body.message === "string" ? body.message.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim() : "";
  if (!quick && !message) return json({ kind: "error", text: MSG.invalid }, 400);
  if (message.length > CHAT_LIMITS.messageMax) return json({ kind: "error", text: MSG.tooLong }, 400);
  const history = cleanHistory(body.history);

  const existing = req.cookies.get(COOKIE)?.value;
  const newSession = !existing || !SID.test(existing);
  const sessionId = newSession ? randomBytes(24).toString("base64url") : existing!;
  // Chế độ thử (CHAT_ALLOW_NO_IP_TEST=1): không tin header IP nào → bỏ giới hạn theo IP, chỉ còn giới hạn phiên,
  // chống gửi trùng, giới hạn đồng thời, timeout và trần tổng chi phí cộng dồn.
  const testMode = chatConfig().noIpTest;
  const ip = testMode ? null : clientIp(req);
  // Không có IP tin cậy → không gọi OpenAI (trừ chế độ thử). Trả lời nhanh chính sách (không dùng AI) vẫn được.
  if (!ip && !quick && !testMode) return json({ kind: "error", code: "noip", text: MSG.noip });
  const captchaToken = typeof body.captchaToken === "string" ? body.captchaToken : "";
  const captchaPassed = captchaToken ? await verifyTurnstile(captchaToken, ip) : false;

  const gate = admitQuestion({
    sessionId,
    newSession,
    ip,
    questionKey: hmac("q", normalizeVietnamese(quick ? `quick:${quick}` : message)).slice(0, 16),
    captchaPassed,
    quick: quick !== null,
  });

  const respond = (data: unknown, status = 200) => {
    const res = json(data, status);
    if (newSession)
      res.cookies.set(COOKIE, sessionId, { httpOnly: true, sameSite: "lax", path: "/api/chat", maxAge: 30 * 86400, secure: process.env.SHOP_SECURE_COOKIES === "1" });
    return res;
  };

  if (!gate.ok) {
    if (gate.reason === "captcha") {
      const siteKey = chatConfig().turnstileSiteKey;
      return siteKey && chatConfig().turnstileSecret ? respond({ kind: "captcha", siteKey }) : respond({ kind: "limited", text: MSG.captchaOff, retryAfterSec: 300 }, 429);
    }
    const text = gate.reason === "busy_session" ? MSG.busySession : gate.reason === "busy_global" ? MSG.busyGlobal : MSG.rate;
    return respond({ kind: "limited", text, retryAfterSec: gate.retryAfterSec }, 429);
  }

  try {
    if (quick) {
      // Câu trả lời cố định lấy trực tiếp từ trang chính sách đang công khai — không gọi AI.
      const page = await policyPage(QUICK_TOPICS[quick], 700);
      return respond(
        page
          ? { kind: "quick", title: page.title, text: page.text, url: page.path, showZalo: true }
          : { kind: "quick", title: "Chưa có thông tin", text: "Website chưa đăng nội dung này. Bạn vui lòng nhắn Zalo để được hỗ trợ.", url: null, showZalo: true },
      );
    }
    const { brandName } = await getSiteSettings();
    // Tìm web (giai đoạn B): chỉ khi công tắc riêng đang Bật; giữ trước lượt tìm, trả lại phần không dùng.
    const webOn = isWebSearchSwitchOn();
    const reserved = webOn ? reserveWebSearches(sessionId, CHAT_LIMITS.webSearchesPerQuestion) : 0;
    const web: WebState = { allowed: reserved, reason: !webOn ? "off" : reserved > 0 ? null : "quota" };
    let used = 0;
    try {
      // req.signal: khách huỷ hoặc ngắt kết nối → dừng gọi OpenAI ngay và mở khoá phiên.
      const ans = await answerQuestion(message, history, brandName, { web, signal: req.signal });
      used = ans.searches;
      if (ans.kind === "answer")
        return respond({ kind: "answer", text: ans.text, products: ans.products, showZalo: ans.showZalo, sources: ans.sources, searched: ans.searches });
      const text = ans.code === "budget" ? MSG.budget : ans.code === "timeout" ? MSG.timeout : ans.code === "config" ? MSG.off : ans.code === "cancelled" ? MSG.cancelled : MSG.api;
      return respond({ kind: "error", code: ans.code, text });
    } finally {
      releaseWebSearches(sessionId, reserved - used);
    }
  } finally {
    releaseLock(gate.ok ? gate.lock : null);
  }
}
