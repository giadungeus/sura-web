"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH, getAdminSession } from "@/lib/server/admin-auth";
import {
  cancelPackageImport,
  commitPackage,
  getPackagePreview,
  isPackageId,
  processPackageImages,
  resolveProductDraft,
  type CommitMode,
  type CommitResult,
  type PackageImageOutcome,
  type PackageImageProgress,
  type PackagePreview,
} from "@/lib/server/package/service";

async function requireAdmin(returnTo: string) {
  const session = await getAdminSession();
  if (!session) redirect(`${ADMIN_LOGIN_PATH}?het-han=1&tiep=${encodeURIComponent(returnTo)}`);
  return session;
}

/** Một lượt xử lý ảnh ngắn (~12 giây). Trình duyệt gọi lặp tới khi hết ảnh chờ. */
export async function processPackageImagesAction(
  batchId: string,
): Promise<(PackageImageProgress & { outcomes: PackageImageOutcome[] }) | { error: string }> {
  await requireAdmin("/admin/nhap-goi");
  if (!isPackageId(batchId)) return { error: "Lượt nhập không hợp lệ." };
  try {
    return await processPackageImages(batchId);
  } catch (error) {
    console.error("[goi] Lỗi lượt ảnh:", error instanceof Error ? error.message : error);
    return { error: "Lỗi hệ thống khi xử lý ảnh. Có thể bấm tiếp tục để thử lại." };
  }
}

export async function getPackagePreviewAction(batchId: string): Promise<PackagePreview> {
  await requireAdmin("/admin/nhap-goi");
  if (!isPackageId(batchId)) return { ok: false, message: "Lượt nhập không hợp lệ." };
  return getPackagePreview(batchId);
}

export async function commitPackageAction(batchId: string, mode: CommitMode): Promise<CommitResult> {
  const session = await requireAdmin("/admin/nhap-goi");
  if (!isPackageId(batchId) || (mode !== "draft" && mode !== "publish")) return { ok: false, message: "Yêu cầu không hợp lệ." };
  const result = commitPackage(batchId, mode, session.username);
  if (result.ok) refresh();
  return result;
}

export async function cancelPackageAction(batchId: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin("/admin/nhap-goi");
  if (!isPackageId(batchId)) return { ok: false, message: "Lượt nhập không hợp lệ." };
  const r = await cancelPackageImport(batchId);
  refresh();
  return r;
}

/** Trang sửa sản phẩm: áp dụng hoặc bỏ bản nháp bài viết từ gói nội dung. */
export async function resolveProductDraftAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await requireAdmin(/^[a-z0-9-]{1,40}$/.test(id) ? `/admin/san-pham/${id}` : "/admin/san-pham");
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return;
  resolveProductDraft(id, formData.get("apply") === "1");
  refresh();
}
