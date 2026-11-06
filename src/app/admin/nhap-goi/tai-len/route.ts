import { getAdminSession } from "@/lib/server/admin-auth";
import { createPackageImport } from "@/lib/server/package/service";
import { PACKAGE_LIMITS } from "@/lib/server/package/zip";

/**
 * Tải gói nội dung ZIP lên (thân yêu cầu là tệp ZIP, tối đa 10 MB). Dùng Route Handler thay vì
 * Server Action vì Server Action giới hạn 6 MB. Chỉ quản trị đã đăng nhập; chỉ nhận yêu cầu từ chính website.
 */
export async function POST(request: Request) {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

  // Chống gửi chéo trang (CSRF): Origin phải trùng máy chủ đang phục vụ (cookie quản trị cũng là SameSite=Strict).
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let sameOrigin = false;
  try {
    sameOrigin = !!origin && !!host && new URL(origin).host === host;
  } catch {}
  if (!sameOrigin) return json(403, { ok: false, message: "Yêu cầu không hợp lệ." });

  const session = await getAdminSession();
  if (!session) return json(401, { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > PACKAGE_LIMITS.zipBytes) return json(413, { ok: false, message: "Gói vượt quá 10 MB." });
  if (!request.body) return json(400, { ok: false, message: "Chưa có tệp." });

  // Đọc theo luồng, dừng ngay khi vượt 10 MB (không tin Content-Length).
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > PACKAGE_LIMITS.zipBytes) {
      await reader.cancel();
      return json(413, { ok: false, message: "Gói vượt quá 10 MB." });
    }
    chunks.push(value);
  }
  let fileName = "goi.zip";
  try {
    fileName = decodeURIComponent(request.headers.get("x-file-name") ?? "goi.zip").replace(/[\u0000-\u001f\\/]/g, "_").slice(0, 200);
  } catch {}

  try {
    const result = await createPackageImport(Buffer.concat(chunks), fileName, session.username);
    return json(result.ok ? 200 : 422, result);
  } catch (error) {
    console.error("[goi] Lỗi tải gói:", error instanceof Error ? error.message : error);
    return json(500, { ok: false, message: "Lỗi hệ thống khi đọc gói. Chưa nhập gì." });
  }
}
