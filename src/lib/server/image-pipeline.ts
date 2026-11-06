/**
 * Quy trình kiểm tra + chuẩn hoá ảnh bằng sharp. Module thuần (không "server-only",
 * không alias) để dùng chung cho website và lệnh `npm run check:sharp` trên hosting —
 * lệnh kiểm tra chạy ĐÚNG đoạn mã mà website dùng.
 */
import sharp, { type Metadata as SharpMetadata, type OutputInfo } from "sharp";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_INPUT_PIXELS = 40_000_000; // ~ 7000 × 5700
const MIN_SIDE = 100;
const OUTPUT_MAX_SIDE = 2000;

export class ImageRejectedError extends Error {}

/** Nhận diện định dạng thật bằng chữ ký đầu tệp (không tin phần mở rộng hay Content-Type). */
export function sniffFormat(buf: Buffer): "jpeg" | "png" | "webp" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return "webp";
  return null;
}

/**
 * Kiểm tra ảnh đầu vào (dùng chung): kích thước tệp, chữ ký định dạng, giải mã thật được,
 * khớp định dạng, không phải ảnh động, cạnh ngắn ≥ 100px, tổng điểm ảnh ≤ 40 triệu.
 */
export async function inspectImage(input: Buffer): Promise<SharpMetadata> {
  if (input.length === 0) throw new ImageRejectedError("Tệp rỗng.");
  if (input.length > MAX_UPLOAD_BYTES) throw new ImageRejectedError("Ảnh vượt quá 5 MB.");
  const sniffed = sniffFormat(input);
  if (!sniffed) throw new ImageRejectedError("Chỉ nhận ảnh JPEG, PNG hoặc WebP.");

  let meta: SharpMetadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).metadata();
  } catch {
    throw new ImageRejectedError("Tệp ảnh bị lỗi, quá nhiều điểm ảnh hoặc không phải ảnh hợp lệ.");
  }
  if (meta.format !== sniffed) throw new ImageRejectedError("Nội dung tệp không khớp định dạng ảnh.");
  if ((meta.pages ?? 1) > 1) throw new ImageRejectedError("Không nhận ảnh động.");
  if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < MIN_SIDE) {
    throw new ImageRejectedError(`Ảnh quá nhỏ (cạnh ngắn cần từ ${MIN_SIDE}px).`);
  }
  return meta;
}

/**
 * Vai trò ảnh trong nội dung, quyết định kích thước và mức dung lượng mục tiêu:
 * - "bia": ảnh đại diện, ảnh bìa tin tức, ảnh sản phẩm — cạnh dài ≤ 1200px, mục tiêu ≤ 150 KB;
 * - "bai": ảnh xen trong bài viết — cạnh dài ≤ 1400px, mục tiêu ≤ 250 KB.
 * Mọi ảnh WebP sau xử lý tối đa 500 KB.
 */
export type ImageRole = "bia" | "bai";
export const IMAGE_ROLES: Record<ImageRole, { maxSide: number; targetBytes: number }> = {
  bia: { maxSide: 1200, targetBytes: 150 * 1024 },
  bai: { maxSide: 1400, targetBytes: 250 * 1024 },
};
export const MAX_OPTIMIZED_BYTES = 500 * 1024;
/** Không hạ chất lượng thấp hơn mức này để chữ nhỏ, chi tiết vẫn đọc rõ. */
const QUALITY_STEPS = [82, 76, 70] as const;

export type OptimizedImage = {
  data: Buffer;
  info: OutputInfo;
  quality: number;
  overTarget: boolean;
  /** true = dùng nguyên tệp WebP nguồn (đã đạt chuẩn), không mã hoá lại. */
  keptSource?: boolean;
};

/**
 * Tệp WebP “sạch”: cấu trúc RIFF khớp đúng độ dài tệp (không có dữ liệu chèn thêm ở cuối) và chỉ gồm
 * các khối ảnh tĩnh VP8 / VP8L / VP8X / ALPH — không EXIF, XMP, ICC, ảnh động hay khối lạ.
 */
function isCleanWebp(buf: Buffer): boolean {
  if (buf.length < 20 || buf.readUInt32LE(4) + 8 !== buf.length) return false;
  let offset = 12;
  let first = true;
  while (offset < buf.length) {
    if (offset + 8 > buf.length) return false;
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (!["VP8 ", "VP8L", "VP8X", "ALPH"].includes(id)) return false;
    // VP8X: chỉ cho phép cờ “có kênh alpha”; cờ ICC/EXIF/XMP/ảnh động → không dùng nguyên tệp.
    if (id === "VP8X" && (!first || size < 10 || (buf[offset + 8] & ~0x10) !== 0)) return false;
    first = false;
    offset += 8 + size + (size & 1);
  }
  return offset === buf.length;
}

/**
 * WebP đã đạt chuẩn của vai trò thì dùng nguyên tệp: cạnh dài ≤ giới hạn, dung lượng ≤ mục tiêu,
 * không siêu dữ liệu/khối lạ, không cần xoay; và GIẢI MÃ TOÀN BỘ được (ảnh thật, trong giới hạn điểm ảnh).
 * Kết quả tương đương mã hoá lại nhưng không tốn thời gian mã hoá.
 */
async function keepCompliantWebp(input: Buffer, meta: SharpMetadata, role: ImageRole): Promise<OptimizedImage | null> {
  const { maxSide, targetBytes } = IMAGE_ROLES[role];
  if (meta.format !== "webp" || !meta.width || !meta.height) return null;
  if (Math.max(meta.width, meta.height) > maxSide || input.length > targetBytes) return null;
  if (meta.exif || meta.xmp || meta.iptc || meta.icc || (meta.orientation ?? 1) !== 1) return null;
  if (!isCleanWebp(input)) return null;
  try {
    await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).raw().toBuffer();
  } catch {
    throw new ImageRejectedError("Tệp ảnh bị lỗi, quá nhiều điểm ảnh hoặc không phải ảnh hợp lệ.");
  }
  const info = { format: "webp", size: input.length, width: meta.width, height: meta.height, channels: meta.channels ?? 3, premultiplied: false } as OutputInfo;
  return { data: input, info, quality: 0, overTarget: false, keptSource: true };
}

/**
 * Tối ưu ảnh cho nội dung: kiểm tra như ảnh tải lên, xoay theo EXIF, thu nhỏ theo vai trò
 * (KHÔNG phóng to ảnh nhỏ, giữ đúng tỉ lệ), bỏ siêu dữ liệu, mã hoá WebP. Giảm chất lượng từng bước
 * (82 → 76 → 70) cho tới khi đạt mục tiêu; không thấp hơn 70. Vẫn > 500 KB → từ chối và báo thay ảnh,
 * không lưu ảnh kém chất lượng.
 */
export async function optimizeImage(input: Buffer, role: ImageRole, opts: { keepCompliantWebp?: boolean } = {}): Promise<OptimizedImage> {
  const meta = await inspectImage(input);
  if (opts.keepCompliantWebp) {
    const kept = await keepCompliantWebp(input, meta, role);
    if (kept) return kept;
  }
  const { maxSide, targetBytes } = IMAGE_ROLES[role];
  let best: OptimizedImage | null = null;
  for (const quality of QUALITY_STEPS) {
    let out: { data: Buffer; info: OutputInfo };
    try {
      out = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
        .rotate()
        .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
        .webp({ quality, smartSubsample: true, effort: 5 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new ImageRejectedError("Không xử lý được ảnh này.");
    }
    best = { ...out, quality, overTarget: out.data.length > targetBytes };
    if (out.data.length <= targetBytes) return best;
  }
  if (best && best.data.length <= MAX_OPTIMIZED_BYTES) return best;
  throw new ImageRejectedError(
    `Sau khi tối ưu ảnh vẫn ${Math.round((best?.data.length ?? 0) / 1024)} KB (giới hạn 500 KB) mà không thể giảm thêm mà vẫn rõ nét. Hãy thay ảnh ít chi tiết hơn hoặc cắt bớt vùng thừa.`,
  );
}

/**
 * - chỉ nhận JPEG/PNG/WebP theo chữ ký tệp và theo kết quả giải mã thật;
 * - giải mã rồi mã hoá lại thành WebP: xoay đúng chiều, thu nhỏ tối đa 2000px,
 *   bỏ toàn bộ siêu dữ liệu (EXIF, vị trí GPS…) và mọi nội dung lạ chèn trong tệp.
 */
export async function normalizeImage(input: Buffer): Promise<{ data: Buffer; info: OutputInfo }> {
  await inspectImage(input);
  try {
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate() // xoay theo EXIF trước khi bỏ siêu dữ liệu
      .resize({ width: OUTPUT_MAX_SIDE, height: OUTPUT_MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new ImageRejectedError("Không xử lý được ảnh này.");
  }
}

export function sharpVersions(): Record<string, string> {
  return { ...(sharp.versions as unknown as Record<string, string>) };
}
