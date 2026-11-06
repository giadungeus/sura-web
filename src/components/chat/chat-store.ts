/**
 * Kho hội thoại của Trợ lý Sura (chỉ chạy trên trình duyệt). Nằm NGOÀI khung chat nên:
 * - đóng/mở khung hoặc chuyển trang (điều hướng trong website) không mất câu đang trả lời;
 * - lịch sử lưu trong localStorage của trình duyệt khách (không lưu khoá hay dữ liệu bí mật), tải lại vẫn còn;
 * - tải lại khi đang chờ → lượt đó được đánh dấu “bị gián đoạn”, KHÔNG tự gửi lại (tránh tốn phí).
 * Lịch sử hiển thị tách khỏi lịch sử gửi AI: AI chỉ nhận phần đã cắt theo CHAT_PUBLIC_LIMITS.
 */
import { CHAT_PUBLIC_LIMITS, trimHistory } from "@/lib/chat-limits";

export type Card = { slug: string; name: string; url: string; price: number; minPrice: number; maxPrice: number; compareAt: number | null; inStock: boolean; variants: number; imageUrl: string | null };
export type Source = { url: string; title: string };
export type UserMsg = { id: string; role: "user"; text: string; state?: "failed" | "interrupted" };
export type BotMsg = {
  id: string;
  role: "assistant";
  text: string;
  products?: Card[];
  sources?: Source[];
  searched?: number;
  showZalo?: boolean;
  link?: { url: string; label: string } | null;
  error?: boolean;
};
export type Msg = UserMsg | BotMsg;
export type ChatState = {
  msgs: Msg[];
  pending: { id: string; startedAt: number } | null;
  captcha: { siteKey: string; userId: string; text: string } | null;
};

const KEY = "sura-tro-ly-v1";
const MAX_MSGS = 40;
const MAX_BYTES = 150_000;
const TTL_MS = 7 * 86_400_000;
/** Máy chủ dừng tối đa sau 45 giây (lượt có tìm web); trình duyệt chờ thêm phần dự phòng cho khởi động lại. */
export const CLIENT_TIMEOUT_MS = 60_000;

export const SAFE_CARD_URL = /^\/(?:san-pham|danh-muc)\/[a-z0-9-]+$|^\/(?:gioi-thieu|lien-he|huong-dan-mua-hang|chinh-sach\/[a-z0-9-]+)$/;
const IMG = /^\/anh\/[\w.-]+$/;

// ───────────── Kiểm tra dữ liệu (đọc từ localStorage hoặc nhận từ máy chủ) ─────────────
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
function toCard(v: unknown): Card | null {
  const c = v as Partial<Card>;
  if (!c || typeof c !== "object") return null;
  if (!str(c.slug, 120) || !/^[a-z0-9-]+$/.test(c.slug) || !str(c.name, 200) || !str(c.url, 200) || !SAFE_CARD_URL.test(c.url)) return null;
  if (!num(c.price) || !num(c.minPrice) || !num(c.maxPrice) || !(c.compareAt === null || num(c.compareAt)) || typeof c.inStock !== "boolean" || !num(c.variants)) return null;
  if (!(c.imageUrl === null || (str(c.imageUrl, 200) && IMG.test(c.imageUrl)))) return null;
  return { slug: c.slug, name: c.name, url: c.url, price: c.price, minPrice: c.minPrice, maxPrice: c.maxPrice, compareAt: c.compareAt, inStock: c.inStock, variants: c.variants, imageUrl: c.imageUrl };
}
function toSource(v: unknown): Source | null {
  const s = v as Partial<Source>;
  if (!s || !str(s.url, 600)) return null;
  try {
    const u = new URL(s.url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return { url: u.href, title: str(s.title, 200) ? s.title : "" };
  } catch {
    return null;
  }
}
const list = <T,>(v: unknown, f: (x: unknown) => T | null, max: number): T[] => (Array.isArray(v) ? v.slice(0, max).map(f).filter((x): x is T => x !== null) : []);
function toMsg(v: unknown): Msg | null {
  const m = v as Record<string, unknown>;
  if (!m || typeof m !== "object" || !str(m.id, 40) || !str(m.text, 8000)) return null;
  if (m.role === "user") return { id: m.id, role: "user", text: m.text, ...(m.state === "failed" || m.state === "interrupted" ? { state: m.state } : {}) };
  if (m.role !== "assistant") return null;
  const link = m.link as { url?: unknown; label?: unknown } | null | undefined;
  return {
    id: m.id,
    role: "assistant",
    text: m.text,
    products: list(m.products, toCard, 6),
    sources: list(m.sources, toSource, 8),
    searched: num(m.searched) ? Math.min(m.searched, 10) : 0,
    showZalo: m.showZalo === true,
    link: link && str(link.url, 200) && SAFE_CARD_URL.test(link.url) && str(link.label, 60) ? { url: link.url, label: link.label } : null,
    error: m.error === true,
  };
}

// ───────────── Kho trạng thái + localStorage ─────────────
let state: ChatState = { msgs: [], pending: null, captcha: null };
let loaded = false;
const listeners = new Set<() => void>();
let inflight: { ctrl: AbortController; reason: "user" | "timeout" | null } | null = null;
/** Tăng mỗi lần “Cuộc trò chuyện mới”: kết quả của lượt thuộc cuộc trò chuyện cũ bị bỏ qua. */
let generation = 0;
/** Trang đang đóng/tải lại (pagehide). */
let unloading = false;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function emit(next: Partial<ChatState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function persist() {
  try {
    let msgs = state.msgs.slice(-MAX_MSGS);
    let data = JSON.stringify({ v: 1, savedAt: Date.now(), msgs, pending: state.pending });
    while (data.length > MAX_BYTES && msgs.length > 1) {
      msgs = msgs.slice(1);
      data = JSON.stringify({ v: 1, savedAt: Date.now(), msgs, pending: state.pending });
    }
    if (msgs.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, data);
  } catch {
    /* trình duyệt chặn hoặc đầy bộ nhớ: vẫn chạy, chỉ không lưu */
  }
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  let msgs: Msg[] = [];
  let interruptedId: string | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && raw.length <= MAX_BYTES * 2) {
      const saved = JSON.parse(raw) as { v?: unknown; savedAt?: unknown; msgs?: unknown; pending?: { id?: unknown } | null };
      if (saved.v === 1 && num(saved.savedAt) && Date.now() - saved.savedAt < TTL_MS) {
        msgs = list(saved.msgs, toMsg, MAX_MSGS);
        if (saved.pending && str(saved.pending.id, 40)) interruptedId = saved.pending.id;
      } else localStorage.removeItem(KEY);
    }
  } catch {
    msgs = [];
  }
  if (interruptedId) {
    // Trang tải lại khi đang chờ: không biết máy chủ đã trả lời chưa → đánh dấu gián đoạn, để khách tự bấm Thử lại.
    const i = msgs.findIndex((m) => m.id === interruptedId && m.role === "user");
    if (i >= 0) {
      msgs[i] = { ...(msgs[i] as UserMsg), state: "interrupted" };
      msgs.splice(i + 1, 0, { id: uid(), role: "assistant", error: true, text: "Lượt trả lời bị gián đoạn vì trang đã tải lại. Bấm **Thử lại** nếu bạn vẫn cần câu trả lời." });
    }
  }
  state = { msgs, pending: null, captcha: null };
  persist();
  const markUnloading = () => {
    unloading = true;
  };
  window.addEventListener("beforeunload", markUnloading);
  window.addEventListener("pagehide", markUnloading);
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) unloading = false; // quay lại từ bộ nhớ đệm trang (nút Back)
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY || state.pending) return;
    // Tab khác thay đổi lịch sử → đồng bộ khi tab này đang rảnh.
    loaded = false;
    load();
    listeners.forEach((l) => l());
  });
}

export function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
}
export const getState = () => state;
const SERVER_STATE: ChatState = { msgs: [], pending: null, captcha: null };
export const getServerState = () => SERVER_STATE;

/** Lịch sử gửi AI: bỏ thông báo lỗi và các câu hỏi chưa có câu trả lời; cắt theo giới hạn chung. */
function aiHistory(msgs: Msg[]) {
  const out: { role: "user" | "assistant"; text: string }[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role === "assistant") {
      if (!m.error) out.push({ role: "assistant", text: m.text });
    } else if (!m.state) out.push({ role: "user", text: m.text });
  }
  return trimHistory(out);
}

function fail(userId: string, text: string, gen: number) {
  if (gen !== generation) return;
  emit({
    msgs: [
      ...state.msgs.map((m) => (m.id === userId && m.role === "user" ? { ...m, state: "failed" as const } : m)),
      { id: uid(), role: "assistant", error: true, text },
    ],
  });
}

type Reply =
  | { kind: "answer"; text: string; products?: unknown; showZalo?: boolean; sources?: unknown; searched?: unknown }
  | { kind: "quick"; title: string; text: string; url: string | null; showZalo?: boolean }
  | { kind: "captcha"; siteKey: string }
  | { kind: "limited" | "error" | "off"; text: string; code?: string; retryAfterSec?: number };

async function request(userId: string, text: string, payload: { message?: string; quick?: string; captchaToken?: string }) {
  const idx = state.msgs.findIndex((m) => m.id === userId);
  const history = aiHistory(idx >= 0 ? state.msgs.slice(0, idx) : state.msgs);
  const gen = generation;
  const ctrl = new AbortController();
  const me = { ctrl, reason: null as "user" | "timeout" | null };
  inflight = me;
  const timer = setTimeout(() => {
    me.reason = "timeout";
    ctrl.abort();
  }, CLIENT_TIMEOUT_MS);
  emit({ pending: { id: userId, startedAt: Date.now() }, captcha: null });
  persist();
  try {
    let res: Response;
    try {
      res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, history }), signal: ctrl.signal });
    } catch {
      // Trang đang đóng/tải lại: trình duyệt tự huỷ yêu cầu → KHÔNG ghi lỗi; giữ dấu “đang chờ” để lần mở sau báo gián đoạn.
      // Chờ ngắn trước khi kết luận lỗi mạng: nếu trang đang đóng, bộ hẹn giờ không bao giờ chạy nên không ghi gì.
      if (!me.reason) await new Promise((r) => setTimeout(r, 300));
      if (unloading) return;
      if (me.reason === "user") return fail(userId, "Bạn đã huỷ câu hỏi này. Bấm **Thử lại** nếu muốn hỏi lại.", gen);
      if (me.reason === "timeout")
        return fail(userId, "Đã chờ quá 60 giây mà chưa có câu trả lời nên mình dừng chờ. Máy chủ có thể đang bận hoặc vừa khởi động lại — bấm **Thử lại** sau vài giây.", gen);
      if (typeof navigator !== "undefined" && navigator.onLine === false) return fail(userId, "Thiết bị đang mất kết nối mạng. Kiểm tra mạng rồi bấm **Thử lại**.", gen);
      return fail(userId, "Không gửi được tới máy chủ (mạng chập chờn hoặc máy chủ đang khởi động lại). Bấm **Thử lại** sau vài giây.", gen);
    }
    let data: Reply | null = null;
    if ((res.headers.get("content-type") ?? "").includes("application/json")) {
      try {
        data = (await res.json()) as Reply;
      } catch {
        data = null;
      }
    }
    if (!data || typeof data !== "object" || !("kind" in data))
      return fail(userId, `Máy chủ tạm thời không phản hồi đúng (mã ${res.status}). Có thể máy chủ đang khởi động lại — bấm **Thử lại** sau vài giây.`, gen);
    if (gen !== generation) return;
    switch (data.kind) {
      case "answer": {
        const m = toMsg({ id: uid(), role: "assistant", text: String(data.text ?? ""), products: data.products, sources: data.sources, searched: data.searched, showZalo: data.showZalo });
        if (m) emit({ msgs: [...state.msgs, m] });
        return;
      }
      case "quick": {
        const m = toMsg({ id: uid(), role: "assistant", text: `**${data.title}**\n\n${data.text}`, link: data.url ? { url: data.url, label: "Xem đầy đủ" } : null, showZalo: data.showZalo });
        if (m) emit({ msgs: [...state.msgs, m] });
        return;
      }
      case "captcha":
        emit({ captcha: { siteKey: String(data.siteKey), userId, text } });
        return;
      case "off":
        emit({ msgs: [...state.msgs, { id: uid(), role: "assistant", error: true, showZalo: true, text: String(data.text) }] });
        return;
      default: {
        const wait = data.kind === "limited" && num(data.retryAfterSec) && data.retryAfterSec > 0 ? ` (thử lại sau khoảng ${Math.ceil(data.retryAfterSec)} giây)` : "";
        return fail(userId, `${String(data.text ?? "Có lỗi xảy ra.")}${wait}`, gen);
      }
    }
  } finally {
    clearTimeout(timer);
    if (inflight === me) inflight = null;
    if (!unloading) {
      if (gen === generation) emit({ pending: null });
      persist();
    }
  }
}

/** Gửi câu hỏi mới. Đang chờ câu trước thì bỏ qua (chống gửi trùng). */
export function send(text: string) {
  const t = text.trim().slice(0, CHAT_PUBLIC_LIMITS.messageMax);
  if (!t || state.pending) return;
  const id = uid();
  emit({ msgs: [...state.msgs, { id, role: "user", text: t }] });
  void request(id, t, { message: t });
}

export function sendQuick(key: string, label: string) {
  if (state.pending) return;
  const id = uid();
  emit({ msgs: [...state.msgs, { id, role: "user", text: label }] });
  void request(id, label, { quick: key });
}

/** Thử lại câu hỏi thất bại/gián đoạn: xoá câu cũ và thông báo lỗi ngay sau nó, rồi gửi lại như câu mới (do khách bấm). */
export function retry(userId: string) {
  if (state.pending) return;
  const i = state.msgs.findIndex((m) => m.id === userId && m.role === "user" && m.state);
  if (i < 0) return;
  const text = state.msgs[i].text;
  const next = state.msgs.filter((_, j) => j !== i && !(j === i + 1 && state.msgs[j].role === "assistant" && (state.msgs[j] as BotMsg).error));
  emit({ msgs: next });
  send(text);
}

/** Gửi lại sau khi khách qua CAPTCHA. */
export function submitCaptcha(token: string) {
  const c = state.captcha;
  if (!c || state.pending) return;
  void request(c.userId, c.text, { message: c.text, captchaToken: token });
}

export function cancel() {
  if (!inflight) return;
  inflight.reason = "user";
  inflight.ctrl.abort();
}

/** Bắt đầu cuộc trò chuyện mới: huỷ câu đang chờ (nếu có) và xoá lịch sử đã lưu. */
export function reset() {
  cancel();
  generation++;
  emit({ msgs: [], captcha: null, pending: null });
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* bỏ qua */
  }
}
