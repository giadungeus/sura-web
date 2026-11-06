import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ImageRejectedError, MAX_UPLOAD_BYTES, normalizeImage } from "@/lib/server/image-pipeline";

/**
 * Ảnh sản phẩm lưu bền vững ngoài thư mục build: mặc định `.data/uploads/products`
 * (đổi bằng biến môi trường SHOP_UPLOAD_DIR). Tên tệp do server tạo ngẫu nhiên.
 */
export function getUploadDir(): string {
  return process.env.SHOP_UPLOAD_DIR || path.join(process.cwd(), ".data", "uploads", "products");
}

export { MAX_UPLOAD_BYTES, ImageRejectedError } from "@/lib/server/image-pipeline";
export const MAX_IMAGES_PER_PRODUCT = 10;

/** Tên tệp hợp lệ: 32 ký tự hex + .webp (chặn mọi đường dẫn lạ như ../). */
export const IMAGE_FILE_PATTERN = /^[a-f0-9]{32}.webp$/;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ProcessedImage = { fileName: string; width: number; height: number; sizeBytes: number };

/** Ảnh tải lên từ trang quản trị: kiểm tra + chuẩn hoá (image-pipeline) rồi lưu. */
export async function processUpload(file: File): Promise<ProcessedImage> {
  if (file.size === 0) throw new ImageRejectedError("Tệp rỗng.");
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageRejectedError("Ảnh vượt quá 5 MB.");
  return processImageBuffer(Buffer.from(await file.arrayBuffer()));
}

/** Cùng quy trình cho ảnh lấy từ nguồn khác (vd. tải từ URL khi nhập CSV). */
export async function processImageBuffer(input: Buffer): Promise<ProcessedImage> {
  const output = await normalizeImage(input);
  const fileName = await writeStoredImage(output.data);
  return { fileName, width: output.info.width, height: output.info.height, sizeBytes: output.info.size };
}

/** Lưu ảnh WebP đã xử lý với tên ngẫu nhiên; ghi tệp tạm rồi đổi tên để không bao giờ phục vụ tệp ghi dở. */
export async function writeStoredImage(data: Buffer): Promise<string> {
  const fileName = `${randomBytes(16).toString("hex")}.webp`;
  const dir = getUploadDir();
  await mkdir(dir, { recursive: true });
  const tmp = path.join(/*turbopackIgnore: true*/ dir, `${fileName}.tmp`);
  await writeFile(tmp, data, { flag: "wx" });
  await rename(tmp, path.join(/*turbopackIgnore: true*/ dir, fileName));
  return fileName;
}

/** Xoá tệp ảnh vừa lưu nhưng không gắn được vào sản phẩm (bỏ qua lỗi). */
export async function discardStoredImage(fileName: string): Promise<void> {
  if (!IMAGE_FILE_PATTERN.test(fileName)) return;
  await unlink(path.join(/*turbopackIgnore: true*/ getUploadDir(), fileName)).catch(() => {});
}

/** Đọc ảnh theo tên do server tạo; null nếu tên không hợp lệ hoặc không tồn tại. */
export async function readStoredImage(fileName: string): Promise<Buffer | null> {
  if (!IMAGE_FILE_PATTERN.test(fileName)) return null;
  try {
    // Thư mục ảnh nằm ngoài mã nguồn, không cần đóng gói vào bản build.
    return await readFile(path.join(/*turbopackIgnore: true*/ getUploadDir(), fileName));
  } catch {
    return null;
  }
}
