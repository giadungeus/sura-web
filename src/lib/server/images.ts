import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata as SharpMetadata, type OutputInfo } from "sharp";

/**
 * Ảnh sản phẩm lưu bền vững ngoài thư mục build: mặc định `.data/uploads/products`
 * (đổi bằng biến môi trường SHOP_UPLOAD_DIR). Tên tệp do server tạo ngẫu nhiên.
 */
export function getUploadDir(): string {
  return process.env.SHOP_UPLOAD_DIR || path.join(process.cwd(), ".data", "uploads", "products");
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGES_PER_PRODUCT = 10;
const MAX_INPUT_PIXELS = 40_000_000; // ~ 7000 × 5700
const MIN_SIDE = 100;
const OUTPUT_MAX_SIDE = 2000;

/** Tên tệp hợp lệ: 32 ký tự hex + .webp (chặn mọi đường dẫn lạ như ../). */
export const IMAGE_FILE_PATTERN = /^[a-f0-9]{32}\.webp$/;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Nhận diện định dạng thật bằng chữ ký đầu tệp (không tin phần mở rộng hay Content-Type). */
function sniffFormat(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "webp";
  return null;
}

export type ProcessedImage = { fileName: string; width: number; height: number; sizeBytes: number };

export class ImageRejectedError extends Error {}

/**
 * Kiểm tra và chuẩn hoá ảnh tải lên:
 * - chỉ nhận JPEG/PNG/WebP theo chữ ký tệp và theo kết quả giải mã thật;
 * - giải mã rồi mã hoá lại thành WebP: xoay đúng chiều, thu nhỏ tối đa 2000px,
 *   bỏ toàn bộ siêu dữ liệu (EXIF, vị trí GPS…) và mọi nội dung lạ chèn trong tệp.
 */
export async function processUpload(file: File): Promise<ProcessedImage> {
  if (file.size === 0) throw new ImageRejectedError("Tệp rỗng.");
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageRejectedError("Ảnh vượt quá 5 MB.");

  const input = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffFormat(input);
  if (!sniffed) throw new ImageRejectedError("Chỉ nhận ảnh JPEG, PNG hoặc WebP.");

  let meta: SharpMetadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).metadata();
  } catch {
    throw new ImageRejectedError("Tệp ảnh bị lỗi hoặc không phải ảnh hợp lệ.");
  }
  if (meta.format !== sniffed) throw new ImageRejectedError("Nội dung tệp không khớp định dạng ảnh.");
  if ((meta.pages ?? 1) > 1) throw new ImageRejectedError("Không nhận ảnh động.");
  if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < MIN_SIDE) {
    throw new ImageRejectedError(`Ảnh quá nhỏ (cạnh ngắn cần từ ${MIN_SIDE}px).`);
  }

  let output: { data: Buffer; info: OutputInfo };
  try {
    output = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate() // xoay theo EXIF trước khi bỏ siêu dữ liệu
      .resize({ width: OUTPUT_MAX_SIDE, height: OUTPUT_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ImageRejectedError("Không xử lý được ảnh này.");
  }

  const fileName = `${randomBytes(16).toString("hex")}.webp`;
  const dir = getUploadDir();
  await mkdir(dir, { recursive: true });
  // Ghi ra tệp tạm rồi đổi tên để không bao giờ phục vụ một tệp ghi dở.
  const tmp = path.join(/*turbopackIgnore: true*/ dir, `${fileName}.tmp`);
  await writeFile(tmp, output.data, { flag: "wx" });
  await rename(tmp, path.join(/*turbopackIgnore: true*/ dir, fileName));
  return { fileName, width: output.info.width, height: output.info.height, sizeBytes: output.info.size };
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
