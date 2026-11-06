"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH, getAdminSession } from "@/lib/server/admin-auth";
import { setChatbotSwitch, setWebSearchSwitch } from "@/lib/server/chat/config";

/** Bật/tắt chatbot tư vấn (Quản trị → Cài đặt website). */
export async function setChatbotAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect(`${ADMIN_LOGIN_PATH}?het-han=1&tiep=${encodeURIComponent("/admin/cai-dat")}`);
  setChatbotSwitch(formData.get("on") === "1", session.username);
  refresh();
}

/** Bật/tắt tìm web cho Trợ lý Sura (mặc định Tắt, độc lập với công tắc chatbot). */
export async function setWebSearchAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect(`${ADMIN_LOGIN_PATH}?het-han=1&tiep=${encodeURIComponent("/admin/cai-dat")}`);
  setWebSearchSwitch(formData.get("on") === "1", session.username);
  refresh();
}
