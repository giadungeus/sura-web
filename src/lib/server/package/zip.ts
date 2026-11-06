/**
 * Đọc ZIP gói nội dung bằng thư viện `yauzl` (giải nén theo luồng, tự kiểm tra tên tệp và kích thước khai báo).
 * Lớp này thêm giới hạn của Sura: dung lượng ZIP, số tệp, dung lượng sau giải nén, tỉ lệ nén (chặn “ZIP bomb”),
 * tên tệp theo danh sách cho phép (không `..`, không đường dẫn tuyệt đối), từ chối tệp mã hoá và liên kết tượng trưng.
 * Không bao giờ ghi tệp ra đĩa theo tên trong ZIP — nội dung chỉ được đọc vào bộ nhớ.
 */
import "server-only";
import type { Readable } from "node:stream";
import yauzl from "yauzl";

export const PACKAGE_LIMITS = {
  zipBytes: 10 * 1024 * 1024,
  files: 150,
  imageBytes: 5 * 1024 * 1024,
  textBytes: 512 * 1024,
  totalBytes: 40 * 1024 * 1024,
  /** Tỉ lệ (sau giải nén / nén) tối đa cho tệp lớn hơn 1 MB sau giải nén. */
  ratio: 100,
} as const;

export class PackageRejectedError extends Error {}

const NAME = /^[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/;
const IGNORED = /^__MACOSX\/|(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/;
const isText = (name: string) => name === "goi.json" || name.endsWith(".md");

async function readCapped(stream: Readable, cap: number, name: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > cap) {
      stream.destroy();
      throw new PackageRejectedError(`${name}: dung lượng sau giải nén vượt giới hạn.`);
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Đọc toàn bộ tệp hợp lệ trong ZIP. `only` (tuỳ chọn): chỉ đọc nội dung các đường dẫn này
 * (dùng khi xử lý ảnh theo lượt), các tệp khác vẫn được kiểm tra tên/kích thước.
 */
export async function readPackageZip(buf: Buffer, only?: ReadonlySet<string>): Promise<{ files: Map<string, Buffer>; ignored: string[] }> {
  if (buf.length === 0) throw new PackageRejectedError("Tệp rỗng.");
  if (buf.length > PACKAGE_LIMITS.zipBytes) throw new PackageRejectedError("Gói vượt quá 10 MB.");
  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.fromBufferPromise(buf, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true });
  } catch {
    throw new PackageRejectedError("Không đọc được tệp ZIP (tệp hỏng hoặc không phải ZIP).");
  }
  // yauzl vừa ném lỗi qua vòng lặp vừa phát sự kiện "error". Thiếu trình nghe sự kiện này, Node coi là
  // lỗi không bắt và DỪNG cả tiến trình (website ngừng phản hồi). Lỗi vẫn được xử lý qua vòng lặp bên dưới.
  zip.on("error", () => {});
  if (zip.entryCount > PACKAGE_LIMITS.files + 50) {
    zip.close();
    throw new PackageRejectedError(`Gói có quá nhiều tệp (tối đa ${PACKAGE_LIMITS.files}).`);
  }
  const files = new Map<string, Buffer>();
  const ignored: string[] = [];
  let total = 0;
  let count = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      if (name.endsWith("/")) continue; // thư mục
      if (IGNORED.test(name)) {
        ignored.push(name);
        continue;
      }
      if (++count > PACKAGE_LIMITS.files) throw new PackageRejectedError(`Gói có quá nhiều tệp (tối đa ${PACKAGE_LIMITS.files}).`);
      if (!NAME.test(name) || name.split("/").some((part) => part === "." || part === ".."))
        throw new PackageRejectedError(`Tên tệp không hợp lệ: “${name.slice(0, 80)}” (chỉ chữ thường không dấu, số, - _ .).`);
      if (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000)
        throw new PackageRejectedError(`${name}: không nhận liên kết tượng trưng.`);
      if (entry.isEncrypted()) throw new PackageRejectedError(`${name}: không nhận tệp có mật khẩu.`);
      if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)
        throw new PackageRejectedError(`${name}: kiểu nén không hỗ trợ.`);
      const image = IMAGE_EXT.test(name);
      if (!image && !isText(name)) throw new PackageRejectedError(`${name}: chỉ nhận goi.json, tệp .md và ảnh .jpg/.jpeg/.png/.webp.`);
      const cap = image ? PACKAGE_LIMITS.imageBytes : PACKAGE_LIMITS.textBytes;
      if (entry.uncompressedSize > cap)
        throw new PackageRejectedError(`${name}: vượt ${image ? "5 MB" : "512 KB"}.`);
      if (entry.uncompressedSize > 1024 * 1024 && entry.uncompressedSize / Math.max(1, entry.compressedSize) > PACKAGE_LIMITS.ratio)
        throw new PackageRejectedError(`${name}: tỉ lệ nén bất thường (nghi “ZIP bomb”).`);
      total += entry.uncompressedSize;
      if (total > PACKAGE_LIMITS.totalBytes) throw new PackageRejectedError("Tổng dung lượng sau giải nén vượt 40 MB.");
      if (only && !only.has(name)) continue;
      const stream = await zip.openReadStreamPromise(entry);
      files.set(name, await readCapped(stream, cap, name));
    }
  } catch (error) {
    if (error instanceof PackageRejectedError) throw error;
    // yauzl tự chặn đường dẫn nguy hiểm (../, đường dẫn tuyệt đối, ký tự “\”).
    if (error instanceof Error && /relative path|absolute path|invalid characters|backslash/i.test(error.message))
      throw new PackageRejectedError("Gói chứa tên tệp nguy hiểm (../, đường dẫn tuyệt đối hoặc ký tự “\\”).");
    throw new PackageRejectedError("Tệp ZIP bị lỗi hoặc kích thước tệp bên trong không khớp.");
  } finally {
    zip.close();
  }
  return { files, ignored };
}

/** Giải mã văn bản UTF-8 nghiêm ngặt (bỏ BOM, chuẩn hoá NFC). */
export function decodeText(buf: Buffer, name: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "").normalize("NFC");
  } catch {
    throw new PackageRejectedError(`${name}: không phải văn bản UTF-8.`);
  }
}
