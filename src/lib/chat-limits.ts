/**
 * Giới hạn chatbot dùng chung cho giao diện (trình duyệt) và máy chủ — sửa một chỗ để hai bên luôn khớp.
 * Máy chủ vẫn tự kiểm tra lại mọi giới hạn; giao diện chỉ cắt trước cho gọn.
 */
export const CHAT_PUBLIC_LIMITS = {
  /** Ký tự tối đa mỗi câu hỏi. */
  messageMax: 800,
  /** Số tin nhắn lịch sử gửi kèm tối đa. */
  historyMessages: 12,
  /** Tổng ký tự lịch sử tối đa (bỏ tin cũ nhất trước). */
  historyChars: 8000,
  /** Ký tự tối đa của MỘT câu trả lời trước đó khi gửi lại làm lịch sử. */
  historyTurnMax: 4000,
} as const;

export type ChatTurnLite = { role: "user" | "assistant"; text: string };

/** Cắt lịch sử theo đúng giới hạn (dùng ở cả giao diện và máy chủ). */
export function trimHistory(turns: ChatTurnLite[]): ChatTurnLite[] {
  const L = CHAT_PUBLIC_LIMITS;
  const out = turns
    .map((t) => ({ role: t.role, text: t.text.trim().slice(0, t.role === "user" ? L.messageMax : L.historyTurnMax) }))
    .filter((t) => t.text)
    .slice(-L.historyMessages);
  while (out.reduce((n, t) => n + t.text.length, 0) > L.historyChars) out.shift();
  return out;
}
