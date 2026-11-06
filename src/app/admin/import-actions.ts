"use server";

import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH, getAdminSession } from "@/lib/server/admin-auth";
import {
  commitImport,
  previewImport,
  processImageJobs,
  type CommitResult,
  type ImageRoundResult,
  type PreviewResult,
} from "@/lib/server/import/service";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect(`${ADMIN_LOGIN_PATH}?het-han=1&tiep=${encodeURIComponent("/admin/nhap-hang")}`);
  return session;
}

const isBatchId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);

/** Bước 1: tải file CSV lên → xem trước (chưa ghi sản phẩm). */
export async function previewImportAction(formData: FormData): Promise<PreviewResult> {
  const session = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Chưa chọn file CSV." };
  try {
    return await previewImport(file, session.username, formData.get("downloadImages") === "1");
  } catch (error) {
    console.error("[import] Lỗi xem trước:", error instanceof Error ? error.message : error);
    return { ok: false, message: "Không đọc được file do lỗi hệ thống." };
  }
}

/** Bước 2: xác nhận nhập (một giao dịch; gửi lại nhiều lần vẫn chỉ ghi một lần). */
export async function commitImportAction(batchId: string, hideNew = false): Promise<CommitResult> {
  await requireAdmin();
  if (!isBatchId(batchId)) return { ok: false, message: "Lượt nhập không hợp lệ." };
  return commitImport(batchId, { newVisible: hideNew !== true });
}

/** Bước 3: tải một lượt ảnh ngắn (~15 giây). Trình duyệt gọi lặp lại tới khi hết ảnh chờ. */
export async function processImportImagesAction(batchId: string): Promise<ImageRoundResult | { error: string }> {
  await requireAdmin();
  if (!isBatchId(batchId)) return { error: "Lượt nhập không hợp lệ." };
  try {
    return await processImageJobs(batchId);
  } catch (error) {
    console.error("[import] Lỗi lượt ảnh:", error instanceof Error ? error.message : error);
    return { error: "Lỗi hệ thống khi tải ảnh. Có thể bấm “Tiếp tục tải ảnh” để thử lại." };
  }
}
