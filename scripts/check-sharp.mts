/**
 * Kiểm tra thư viện xử lý ảnh (sharp) trên máy đang chạy — dùng trên hosting trước khi
 * cho phép tải/nhập ảnh:
 *
 *   npm run check:sharp                       → tự tạo ảnh thử và xử lý
 *   npm run check:sharp -- ~/anh-thu.jpg      → xử lý thêm một ảnh thật của bạn
 *
 * Chạy ĐÚNG quy trình website dùng (src/lib/server/image-pipeline.ts): kiểm tra định dạng,
 * xoay theo EXIF, thu nhỏ ≤ 2000px, xoá siêu dữ liệu, mã hoá WebP.
 * KHÔNG đọc/ghi CSDL hay thư mục .data — ảnh kết quả chỉ ghi vào thư mục tạm của hệ thống.
 */
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type Report = { header?: { glibcVersionRuntime?: string; glibcVersionCompiler?: string } };
const header = (process.report?.getReport() as Report | undefined)?.header ?? {};
console.log("== Môi trường");
console.log(`  Node.js ${process.version} · ${process.platform}/${process.arch} · glibc ${header.glibcVersionRuntime ?? "(không phải Linux/glibc)"}`);

let pipeline: typeof import("../src/lib/server/image-pipeline.ts");
try {
  pipeline = await import("../src/lib/server/image-pipeline.ts");
} catch (error) {
  console.error("\n✗ KHÔNG NẠP ĐƯỢC sharp — tải/nhập ảnh sẽ không hoạt động trên máy này.");
  console.error(`  Lỗi: ${error instanceof Error ? error.message.split("\n").slice(0, 6).join("\n        ") : error}`);
  console.error("  Gợi ý: chạy lại “Run NPM Install”; nếu lỗi nhắc GLIBC/libvips thì máy chủ thiếu thư viện hệ thống phù hợp.");
  process.exit(1);
}
const sharp = (await import("sharp")).default;
const versions = pipeline.sharpVersions();
console.log(`  sharp ${versions.sharp ?? "?"} · libvips ${versions.vips ?? "?"}`);

let failed = false;
const report = async (label: string, input: Buffer, expect?: { width: number; height: number }) => {
  const started = performance.now();
  try {
    const out = await pipeline.normalizeImage(input);
    const ms = Math.round(performance.now() - started);
    const meta = await sharp(out.data).metadata();
    const target = path.join(os.tmpdir(), `check-sharp-${Date.now()}-${label.replace(/\W+/g, "-")}.webp`);
    writeFileSync(target, out.data);
    const sizeOk = !expect || (out.info.width === expect.width && out.info.height === expect.height);
    const clean = !meta.exif && !out.data.includes("GPS-TEST");
    console.log(`  ${sizeOk && clean ? "✓" : "✗"} ${label}: ${(input.length / 1024).toFixed(0)} KB → ${out.info.format} ${out.info.width}×${out.info.height}, ${(out.info.size / 1024).toFixed(0)} KB, ${ms} ms`);
    console.log(`      đã xoá EXIF/GPS: ${clean ? "có" : "KHÔNG"}${expect ? ` · xoay/thu nhỏ đúng (${expect.width}×${expect.height}): ${sizeOk ? "có" : "KHÔNG"}` : ""}`);
    console.log(`      ảnh kết quả (tạm): ${target}`);
    if (!sizeOk || !clean) failed = true;
    return ms;
  } catch (error) {
    failed = true;
    console.log(`  ✗ ${label}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
};

console.log("\n== Ảnh thử tự tạo (JPEG 3000×2000, EXIF xoay 90° + GPS)");
const generated = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#0ea5e9" } })
  .jpeg({ quality: 90 })
  .withMetadata({ orientation: 6 })
  .withExifMerge({ IFD0: { Copyright: "GPS-TEST" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "10/1 46/1 0/1" } })
  .toBuffer();
// Xoay 90° → 2000×3000, thu nhỏ vừa khung 2000 → 1333×2000.
const genMs = await report("anh-tu-tao", generated, { width: 1333, height: 2000 });

const fileArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
let fileMs: number | null = null;
if (fileArg) {
  console.log(`\n== Ảnh của bạn: ${fileArg}`);
  try {
    fileMs = await report(path.basename(fileArg), readFileSync(fileArg));
  } catch (error) {
    failed = true;
    console.log(`  ✗ Không đọc được tệp: ${error instanceof Error ? error.message : error}`);
  }
}

const slowest = Math.max(genMs ?? 0, fileMs ?? 0);
console.log("\n== Ước tính thời gian nhập ảnh");
console.log(`  Xử lý một ảnh: ~${slowest} ms (chưa tính thời gian tải từ URL).`);
const budget = Number(process.env.SHOP_IMPORT_IMAGE_BUDGET_MS) || 15_000;
console.log(`  Khi nhập CSV, mỗi lượt ảnh ngừng nhận ảnh mới sau ${budget / 1000} giây (SHOP_IMPORT_IMAGE_BUDGET_MS);`);
console.log(`  mỗi ảnh tải tối đa 15 giây. Lượt dài nhất ≈ ${budget / 1000} + 15 + ${Math.ceil(slowest / 1000)} ≈ ${Math.ceil(budget / 1000 + 15 + slowest / 1000)} giây.`);
console.log("  Nếu hosting cắt yêu cầu ngắn hơn mức này, giảm SHOP_IMPORT_IMAGE_BUDGET_MS (vd. 5000).");

console.log(failed ? "\n✗ CÓ LỖI — chưa nên dùng chức năng ảnh trên máy này." : "\n✓ sharp hoạt động bình thường.");
process.exit(failed ? 1 : 0);
