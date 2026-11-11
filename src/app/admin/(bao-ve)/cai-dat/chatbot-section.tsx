import { headers } from "next/headers";
import { CHAT_LIMITS, CHAT_TEST_TOTAL_CAP_USD, chatConfig, isChatbotSwitchOn, isWebSearchSwitchOn, webSearchesPerDay } from "@/lib/server/chat/config";
import { lifetimeSpentUsd, todayStats, webSearchesToday } from "@/lib/server/chat/guard";
import { setChatbotAction, setWebSearchAction } from "../../chat-actions";

/** Che bớt IP để quản trị đối chiếu (không hiện đầy đủ, không lưu). */
function maskIp(ip: string): string {
  if (ip.includes(".")) return ip.split(".").slice(0, 2).join(".") + ".*.*";
  if (ip.includes(":")) return ip.split(":").slice(0, 2).join(":") + ":…";
  return "";
}

/** Công tắc và trạng thái chatbot tư vấn. Không bao giờ hiển thị khoá API. */
export async function ChatbotSection() {
  const cfg = chatConfig();
  const on = isChatbotSwitchOn();
  const s = todayStats();
  const h = await headers();
  const ip = h.get("x-sura-client-ip") ?? "";
  const source = h.get("x-sura-ip-source");
  const ipSourceSetting = String(process.env.SURA_IP_SOURCE ?? "").trim();
  // Số địa chỉ proxy tin cậy (chỉ đếm, không hiện địa chỉ) — dùng cho chế độ coolify-traefik.
  const trustedProxyCount = String(process.env.SURA_TRUSTED_PROXY_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;
  const ipSourceText =
    ipSourceSetting === "inet-oneshield"
      ? "inet-oneshield — chỉ tin X-Real-IP do OneShield gắn"
      : ipSourceSetting === "coolify-traefik"
        ? trustedProxyCount > 0
          ? `coolify-traefik — chỉ tin X-Forwarded-For khi kết nối đến từ proxy tin cậy (SURA_TRUSTED_PROXY_IPS: ${trustedProxyCount} địa chỉ)`
          : "coolify-traefik — CHƯA đặt SURA_TRUSTED_PROXY_IPS nên không tin nguồn nào"
        : ipSourceSetting
          ? `“${ipSourceSetting}” không hợp lệ — không tin nguồn nào`
          : "chưa đặt — Passenger/kết nối trực tiếp";
  const sourceLabel =
    source === "coolify-traefik"
      ? "Coolify / Traefik (X-Forwarded-For)"
      : source === "oneshield"
        ? "OneShield / X-Real-IP"
        : source === "passenger"
          ? "header bảo mật của Passenger"
          : "kết nối trực tiếp";
  const usd = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} USD`;
  const active = on && cfg.apiKey !== "";
  const webOn = isWebSearchSwitchOn();
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Chatbot tư vấn khách hàng</h2>
          <p className="text-neutral-500">
            {active ? "Đang bật — khách thấy nút “Tư vấn”." : on ? "Công tắc đang Bật nhưng thiếu khoá API nên chatbot KHÔNG chạy." : "Đang tắt."}
          </p>
        </div>
        <form action={setChatbotAction}>
          <input type="hidden" name="on" value={on ? "0" : "1"} />
          <button
            type="submit"
            className={`h-10 rounded-full px-4 font-semibold ${on ? "border border-neutral-300 bg-white text-neutral-900" : "bg-neutral-900 text-white"}`}
          >
            {on ? "Tắt chatbot" : "Bật chatbot"}
          </button>
        </form>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-neutral-50 p-3">
        <div>
          <p className="font-medium">Tìm web (giai đoạn B)</p>
          <p className="text-neutral-500">
            {webOn ? "Đang bật" : "Đang tắt"} · hôm nay {webSearchesToday()}/{webSearchesPerDay()} lần tìm · tối đa {CHAT_LIMITS.webSearchesPerQuestion} lần/câu hỏi,{" "}
            {CHAT_LIMITS.webSearchesPerSessionDay} lần/phiên/ngày · phí 0,01 USD/lần tìm + token nội dung tìm được.
          </p>
        </div>
        <form action={setWebSearchAction}>
          <input type="hidden" name="on" value={webOn ? "0" : "1"} />
          <button type="submit" className={`h-10 rounded-full px-4 font-semibold ${webOn ? "border border-neutral-300 bg-white text-neutral-900" : "bg-neutral-900 text-white"}`}>
            {webOn ? "Tắt tìm web" : "Bật tìm web"}
          </button>
        </form>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-neutral-600">
        <li>Khoá API (biến môi trường OPENAI_API_KEY): {cfg.apiKey ? "đã cấu hình" : "chưa có"}</li>
        <li>Model: {cfg.model}</li>
        {cfg.noIpTest && (
          <li>
            <b className="text-brand-700">Chế độ thử không cần IP (CHAT_ALLOW_NO_IP_TEST=1): ĐANG BẬT.</b> Không dùng IP, không có giới hạn theo IP; vẫn giới
            hạn theo phiên, chống gửi trùng, đồng thời và thời gian. Tổng chi phí từ trước tới nay: {usd(lifetimeSpentUsd())} / {usd(CHAT_TEST_TOTAL_CAP_USD)} — đạt
            trần thì chatbot dừng hẳn (không tự đặt lại khi Restart hay sang ngày mới).
          </li>
        )}
        <li>
          Hôm nay ({s.day}, giờ Việt Nam): đã dùng {usd(s.spentUsd)} / ngân sách {usd(s.budgetUsd)}
          {s.reservedUsd > 0 && ` (đang giữ trước ${usd(s.reservedUsd)})`} · {s.questions} câu hỏi AI · {s.quickAnswers} trả lời nhanh · {s.apiCalls} lần gọi API · {s.blocked} lượt bị chặn · {s.errors} lỗi
        </li>
        <li>
          Giới hạn: {CHAT_LIMITS.sessionPerMinute} câu/phút và {CHAT_LIMITS.sessionPerDay} câu/ngày mỗi phiên; {CHAT_LIMITS.ipPerMinute} câu/phút, {CHAT_LIMITS.ipPerDay}{" "}
          câu/ngày mỗi IP; tối đa {cfg.maxConcurrent} câu xử lý cùng lúc.
        </li>
        <li>CAPTCHA (Cloudflare Turnstile): {cfg.turnstileSiteKey && cfg.turnstileSecret ? "đã cấu hình" : "chưa cấu hình — khi hỏi dồn dập sẽ tạm chặn vài phút thay cho CAPTCHA"}</li>
        <li>
          Nguồn IP cấu hình (SURA_IP_SOURCE): {ipSourceText}.
        </li>
        <li>
          IP hệ thống nhận diện cho bạn:{" "}
          {ip ? (
            <>
              {maskIp(ip)} (nguồn: {sourceLabel}) — so với IP thật của bạn để kiểm tra.
            </>
          ) : cfg.noIpTest ? (
            "không xác định."
          ) : (
            <b className="text-brand-700">
              không xác định — chatbot KHÔNG gọi AI, chỉ trả lời nhanh chính sách và chuyển khách sang Zalo.
            </b>
          )}
          {cfg.noIpTest && " Chế độ thử không cần IP đang bật nên chưa dùng IP để giới hạn lượt hỏi."}
        </li>
      </ul>
    </section>
  );
}
