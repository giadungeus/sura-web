/**
 * Ảnh dùng trong thân bài và ảnh bìa (bảng content_images). Tối ưu theo vai trò (image-pipeline),
 * lưu WebP ở thư mục ảnh chung, phục vụ qua /anh/<tên>. Cùng ảnh gốc (SHA-256) + cùng vai trò → dùng lại.
 */
import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/server/db";
import { optimizeImage, type ImageRole } from "@/lib/server/image-pipeline";
import { discardStoredImage, writeStoredImage } from "@/lib/server/images";

export type StoredContentImage = { fileName: string; width: number; height: number; sizeBytes: number; reused: boolean; overTarget: boolean };

export const sha256 = (data: Buffer) => createHash("sha256").update(data).digest("hex");

/** Cú pháp chèn ảnh vào nội dung (có kích thước để trang không giật khi ảnh tải). */
export const imageMarkup = (img: { fileName: string; width: number; height: number }, alt: string, caption = "") =>
  `![${alt.replace(/[\]\n]/g, " ").trim()}](/anh/${img.fileName}#${img.width}x${img.height}${caption ? ` "${caption.replace(/["\n]/g, " ").trim()}"` : ""})`;

export function findContentImage(hash: string, role: ImageRole): StoredContentImage | null {
  const row = getDb()
    .prepare("SELECT file_name, width, height, size_bytes FROM content_images WHERE source_sha256 = ? AND variant = ?")
    .get(hash, role) as { file_name: string; width: number; height: number; size_bytes: number } | undefined;
  return row ? { fileName: row.file_name, width: row.width, height: row.height, sizeBytes: row.size_bytes, reused: true, overTarget: false } : null;
}

/** Tối ưu + ghi tệp (CHƯA ghi CSDL) — dùng cho lượt nhập gói, ghi CSDL lúc xác nhận. */
export async function prepareImageFile(input: Buffer, role: ImageRole): Promise<StoredContentImage> {
  // Nhập gói: WebP đã đạt chuẩn (kích thước, dung lượng, không siêu dữ liệu) được dùng nguyên tệp.
  const out = await optimizeImage(input, role, { keepCompliantWebp: true });
  const fileName = await writeStoredImage(out.data);
  return { fileName, width: out.info.width, height: out.info.height, sizeBytes: out.info.size, reused: false, overTarget: out.overTarget };
}

/** Tải ảnh từ trình soạn thảo: tối ưu, lưu và ghi CSDL ngay (dùng lại nếu đã có ảnh giống hệt). */
export async function saveContentImage(input: Buffer, role: ImageRole, username: string): Promise<StoredContentImage> {
  const hash = sha256(input);
  const existing = findContentImage(hash, role);
  if (existing) return existing;
  const prepared = await prepareImageFile(input, role);
  const r = getDb()
    .prepare(
      `INSERT INTO content_images (file_name, source_sha256, variant, width, height, size_bytes, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(source_sha256, variant) DO NOTHING`,
    )
    .run(prepared.fileName, hash, role, prepared.width, prepared.height, prepared.sizeBytes, username, new Date().toISOString());
  if (r.changes === 0) {
    // Yêu cầu khác vừa lưu cùng ảnh: bỏ tệp của mình, dùng tệp đã có.
    await discardStoredImage(prepared.fileName);
    return findContentImage(hash, role)!;
  }
  return prepared;
}
