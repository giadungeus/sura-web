import { readStoredImage } from "@/lib/server/images";

/**
 * Phục vụ ảnh sản phẩm đã tải lên: /anh/<32 hex>.webp
 * Tên tệp bị kiểm tra chặt nên không thể đọc tệp nào khác ngoài thư mục ảnh.
 */
export async function GET(_request: Request, ctx: RouteContext<"/anh/[file]">) {
  const { file } = await ctx.params;
  const data = await readStoredImage(file);
  if (!data) {
    return new Response("Không tìm thấy ảnh", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(data.length),
      // Tên tệp ngẫu nhiên và không bao giờ bị ghi đè nên có thể lưu cache lâu.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
