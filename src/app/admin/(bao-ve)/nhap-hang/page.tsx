import { Suspense } from "react";
import type { Metadata } from "next";
import { Download } from "lucide-react";
import { IMPORT_COLUMNS } from "@/lib/import/columns";
import { MAX_CSV_ROWS } from "@/lib/import/csv";
import { requireAdmin } from "@/lib/server/admin-auth";
import { batchesWithPendingImages } from "@/lib/server/import/service";
import { ImportClient } from "./import-client";

export const metadata: Metadata = { title: "Nhập sản phẩm" };

export default function ImportPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireAdmin("/admin/nhap-hang");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Nhập sản phẩm từ CSV</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Dùng cho nguồn hàng đại lý (Baseus, TechMall…). Mỗi dòng là một phiên bản (SKU). Có bước xem trước, chưa ghi gì
          cho tới khi bạn xác nhận.
        </p>
      </div>

      <ImportClient pendingBatches={batchesWithPendingImages()} />

      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Hướng dẫn cột</h2>
          <a
            href="/mau/nhap-san-pham-mau.csv"
            download
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-300 px-3 text-sm hover:bg-neutral-50"
          >
            <Download className="size-4" aria-hidden /> Tải file mẫu
          </a>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-600">
          <li>File CSV mã hoá UTF-8 (trong Excel: Lưu dưới dạng → “CSV UTF-8”), dấu phân cách “,” hoặc “;”, tối đa {MAX_CSV_ROWS} dòng, 2 MB.</li>
          <li>Sản phẩm được nhận diện theo <b>nguon + ma_san_pham</b>; phiên bản theo <b>sku</b>. Nhập lại cùng file không tạo trùng.</li>
          <li>
            Bước xác nhận ghi tất cả trong một lần: nếu bị ngắt giữa chừng thì không có gì được ghi và có thể xác nhận lại; bấm
            lại sau khi đã ghi cũng không ghi trùng. Ảnh được tải sau đó theo từng lượt ngắn; trang bị đóng thì có thể tiếp tục.
          </li>
          <li>
            Sản phẩm và danh mục <b>mới</b> mặc định <b>Hiện</b> (công khai) khi xác nhận; có thể chọn tạo ở trạng thái Ẩn. Mục đã có giữ nguyên Hiện/Ẩn.
          </li>
          <li>Ô để trống khi cập nhật = giữ nguyên giá trị hiện có. Hệ thống không tự đặt giá bán hay tồn kho.</li>
          <li>
            <b>gia_nhap</b> chỉ lưu nội bộ, không hiển thị ở cửa hàng và không bao giờ được dùng làm giá bán.
          </li>
          <li>Không xoá sản phẩm hay phiên bản: phiên bản không có trong file được giữ nguyên.</li>
        </ul>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-neutral-500 uppercase">
              <tr>
                <th className="py-2 pr-3 font-medium">Cột</th>
                <th className="py-2 pr-3 font-medium">Bắt buộc</th>
                <th className="py-2 pr-3 font-medium">Ý nghĩa</th>
                <th className="py-2 font-medium">Ví dụ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {IMPORT_COLUMNS.map((c) => (
                <tr key={c.key} className="align-top">
                  <td className="py-2 pr-3 font-mono text-xs">{c.key}</td>
                  <td className="py-2 pr-3 text-xs whitespace-nowrap">
                    {c.required === "always" ? "Luôn" : c.required === "new" ? "Khi tạo mới" : "Không"}
                  </td>
                  <td className="py-2 pr-3 text-neutral-700">{c.description}</td>
                  <td className="py-2 font-mono text-xs break-all text-neutral-500">{c.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
