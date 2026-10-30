"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  ADMIN_LOGIN_PATH,
  attemptAdminLogin,
  endAdminSession,
  getAdminSession,
  safeAdminReturnPath,
  startAdminSession,
} from "@/lib/server/admin-auth";
import { addInternalNote, changeOrderStatus } from "@/lib/server/admin-orders";
import { ORDER_CODE_PATTERN } from "@/lib/server/orders";

// ───────────── Đăng nhập / đăng xuất ─────────────

export type LoginState = { error?: string; username?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").slice(0, 64);
  const password = String(formData.get("password") ?? "");
  const next = safeAdminReturnPath(formData.get("tiep"));

  if (!username.trim() || !password) {
    return { error: "Vui lòng nhập tên đăng nhập và mật khẩu.", username };
  }
  if (password.length > 200) {
    return { error: "Tên đăng nhập hoặc mật khẩu không đúng.", username };
  }

  let outcome: Awaited<ReturnType<typeof attemptAdminLogin>>;
  try {
    outcome = await attemptAdminLogin(username, password);
  } catch (error) {
    console.error("[admin] Lỗi đăng nhập:", error instanceof Error ? error.message : error);
    return { error: "Hệ thống đang gặp lỗi, vui lòng thử lại sau.", username };
  }

  if (!outcome.ok) {
    return outcome.reason === "locked"
      ? {
          error: `Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${outcome.minutes} phút.`,
          username,
        }
      : { error: "Tên đăng nhập hoặc mật khẩu không đúng.", username };
  }

  await startAdminSession(outcome.adminId);
  redirect(next); // Gọi ngoài try/catch theo hướng dẫn của Next.js.
}

export async function logoutAction(): Promise<void> {
  await endAdminSession();
  redirect(`${ADMIN_LOGIN_PATH}?da-dang-xuat=1`);
}

// ───────────── Thao tác trên đơn hàng ─────────────

export type MutationState = { ok?: boolean; message?: string; at?: number };

/** Kiểm tra lại phiên cho mỗi thao tác; hết phiên thì đưa về trang đăng nhập. */
async function requireAdminForAction(code: string) {
  const session = await getAdminSession();
  if (!session) {
    const back = ORDER_CODE_PATTERN.test(code) ? `/admin/don-hang/${code}` : "/admin";
    redirect(`${ADMIN_LOGIN_PATH}?het-han=1&tiep=${encodeURIComponent(back)}`);
  }
  return session;
}

export async function changeStatusAction(_prev: MutationState, formData: FormData): Promise<MutationState> {
  const code = String(formData.get("code") ?? "").toUpperCase();
  const session = await requireAdminForAction(code);

  let result: { ok: boolean; message: string };
  try {
    result = changeOrderStatus({
      code,
      expectedStatus: formData.get("expected"),
      toStatus: formData.get("to"),
      reason: formData.get("reason"),
      adminUsername: session.username,
    });
  } catch (error) {
    console.error("[admin] Lỗi đổi trạng thái:", error instanceof Error ? error.message : error);
    result = { ok: false, message: "Không lưu được thay đổi do lỗi hệ thống. Vui lòng thử lại." };
  }
  refresh(); // Tải lại trang để hiển thị trạng thái mới nhất (kể cả khi bị xung đột).
  return { ...result, at: Date.now() };
}

export async function addNoteAction(_prev: MutationState, formData: FormData): Promise<MutationState> {
  const code = String(formData.get("code") ?? "").toUpperCase();
  const session = await requireAdminForAction(code);

  let result: { ok: boolean; message: string };
  try {
    result = addInternalNote({ code, body: formData.get("body"), adminUsername: session.username });
  } catch (error) {
    console.error("[admin] Lỗi thêm ghi chú:", error instanceof Error ? error.message : error);
    result = { ok: false, message: "Không lưu được ghi chú do lỗi hệ thống. Vui lòng thử lại." };
  }
  if (result.ok) refresh();
  return { ...result, at: Date.now() };
}
