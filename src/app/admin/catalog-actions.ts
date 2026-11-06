"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH, getAdminSession } from "@/lib/server/admin-auth";
import {
  VariantWriteError,
  deleteCategory,
  deleteProduct,
  saveCategoryContent,
  recordUploadedImage,
  saveCategory,
  saveProduct,
  setCategoryVisibility,
  setProductVisibility,
  type AdminImage,
  type FieldErrors,
} from "@/lib/server/admin-catalog";
import { ImageRejectedError, discardStoredImage, processUpload } from "@/lib/server/images";

/** Mọi thao tác quản trị đều kiểm tra lại phiên; hết phiên thì về trang đăng nhập. */
async function requireAdmin(returnTo: string) {
  const session = await getAdminSession();
  if (!session) redirect(`${ADMIN_LOGIN_PATH}?het-han=1&tiep=${encodeURIComponent(returnTo)}`);
  return session;
}

const PRODUCT_ID = /^[a-z0-9-]{1,40}$/;

export type FormState = { ok?: boolean; message?: string; fieldErrors?: FieldErrors; at?: number };

// ───────────── Danh mục ─────────────

export async function saveCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const idRaw = String(formData.get("id") ?? "");
  const id = /^\d+$/.test(idRaw) ? Number(idRaw) : null;
  await requireAdmin(id ? `/admin/danh-muc/${id}` : "/admin/danh-muc/moi");

  const result = saveCategory(id, Object.fromEntries(formData));
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, at: Date.now() };
  redirect(`/admin/danh-muc?da-luu=${result.value.id}`);
}

export async function toggleCategoryAction(formData: FormData): Promise<void> {
  await requireAdmin("/admin/danh-muc");
  const id = Number(formData.get("id"));
  if (Number.isInteger(id)) setCategoryVisibility(id, formData.get("visible") === "1");
  refresh();
}

export async function deleteCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin("/admin/danh-muc");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { ok: false, message: "Danh mục không hợp lệ.", at: Date.now() };
  const result = deleteCategory(id);
  if (!result.ok) return { ok: false, message: result.message, at: Date.now() };
  redirect("/admin/danh-muc?da-xoa=1");
}

/** Khối “Nội dung & SEO” của danh mục: Lưu nháp / Công khai / Bỏ nháp. */
export async function saveCategoryContentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = Number(formData.get("id"));
  await requireAdmin(Number.isInteger(id) ? `/admin/danh-muc/${id}` : "/admin/danh-muc");
  const intent = String(formData.get("intent") ?? "");
  if (!Number.isInteger(id) || !["draft", "publish", "discard"].includes(intent)) return { ok: false, message: "Yêu cầu không hợp lệ.", at: Date.now() };
  const result = saveCategoryContent(id, Object.fromEntries(formData), intent as "draft" | "publish" | "discard");
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, at: Date.now() };
  refresh();
  return { ok: true, message: result.message, at: Date.now() };
}

// ───────────── Sản phẩm ─────────────

export async function saveProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const idRaw = String(formData.get("id") ?? "");
  const productId = PRODUCT_ID.test(idRaw) ? idRaw : null;
  const session = await requireAdmin(productId ? `/admin/san-pham/${productId}` : "/admin/san-pham/moi");

  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { ok: false, message: "Dữ liệu gửi lên không hợp lệ.", at: Date.now() };
  }

  let result: ReturnType<typeof saveProduct>;
  try {
    result = saveProduct(productId, payload, session.username);
  } catch (error) {
    if (error instanceof VariantWriteError) return { ok: false, message: error.message, at: Date.now() };
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[admin] Lỗi lưu sản phẩm:", msg);
    if (/UNIQUE constraint failed: product_variants\.sku/.test(msg))
      return { ok: false, message: "Có SKU đã tồn tại ở sản phẩm khác.", at: Date.now() };
    if (/UNIQUE constraint failed: products\.slug/.test(msg))
      return { ok: false, message: "Slug đã được dùng cho sản phẩm khác.", at: Date.now() };
    return { ok: false, message: "Không lưu được do lỗi hệ thống. Vui lòng thử lại.", at: Date.now() };
  }
  if (!result.ok) return { ok: false, message: result.message, fieldErrors: result.fieldErrors, at: Date.now() };
  redirect(`/admin/san-pham/${result.value.id}?da-luu=1`);
}

/** Xoá hẳn sản phẩm chưa có đơn hàng (xem điều kiện trong deleteProduct). */
export async function deleteProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  await requireAdmin(PRODUCT_ID.test(id) ? `/admin/san-pham/${id}` : "/admin/san-pham");
  if (!PRODUCT_ID.test(id)) return { ok: false, message: "Sản phẩm không hợp lệ.", at: Date.now() };
  let result: ReturnType<typeof deleteProduct>;
  try {
    result = deleteProduct(id);
  } catch (error) {
    console.error("[admin] Lỗi xoá sản phẩm:", error instanceof Error ? error.message : error);
    return { ok: false, message: "Không xoá được do lỗi hệ thống. Chưa có gì thay đổi.", at: Date.now() };
  }
  if (!result.ok) return { ok: false, message: result.message, at: Date.now() };
  // Chỉ xoá tệp ảnh sau khi CSDL đã xoá xong (lỗi giữa chừng không làm mất ảnh).
  for (const f of result.files) await discardStoredImage(f);
  redirect(`/admin/san-pham?da-xoa=${encodeURIComponent(result.message)}`);
}

export async function toggleProductAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  await requireAdmin(PRODUCT_ID.test(id) ? `/admin/san-pham/${id}` : "/admin/san-pham");
  if (PRODUCT_ID.test(id)) setProductVisibility(id, formData.get("visible") === "1");
  refresh();
}

export type UploadResult = { ok: true; image: AdminImage } | { ok: false; message: string };

/** Tải một ảnh lên. Ảnh chỉ gắn vào sản phẩm khi bấm “Lưu”. */
export async function uploadProductImageAction(formData: FormData): Promise<UploadResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Không nhận được tệp." };
  try {
    const processed = await processUpload(file);
    return { ok: true, image: recordUploadedImage(processed, session.username) };
  } catch (error) {
    if (error instanceof ImageRejectedError) return { ok: false, message: `${file.name}: ${error.message}` };
    console.error("[admin] Lỗi tải ảnh:", error instanceof Error ? error.message : error);
    return { ok: false, message: `${file.name}: không lưu được ảnh do lỗi hệ thống.` };
  }
}
