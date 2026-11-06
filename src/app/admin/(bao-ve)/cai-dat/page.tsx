import { Suspense } from "react";
import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { formatDateTime } from "@/lib/format-date";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getSettingsForAdmin } from "@/lib/server/site-content";
import { ChatbotSection } from "./chatbot-section";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Cài đặt website" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Cài đặt website</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Thông tin hiển thị ở header, chân trang, nút Hỗ trợ, trang Liên hệ và các biến trong Trang nội dung. Lưu xong là
          website cập nhật ngay.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireAdmin("/admin/cai-dat");
  const { values, meta } = getSettingsForAdmin();
  return (
    <>
      {meta.updatedAt && (
        <p className="text-xs text-neutral-500">
          Cập nhật lần cuối: {formatDateTime(meta.updatedAt)}
          {meta.updatedBy && ` · ${meta.updatedBy === "khoi-tao" ? "dữ liệu khởi tạo" : meta.updatedBy}`}
        </p>
      )}
      <SettingsForm initial={values} />
      <ChatbotSection />
      <section className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4 text-sm sm:p-5">
        <h2 className="font-semibold">Giao hàng và thanh toán (không sửa tại đây)</h2>
        <ul className="list-disc space-y-1 pl-5 text-neutral-600">
          <li>
            Phí giao hàng: <b>{siteConfig.shipping.label}</b> ({siteConfig.shipping.fee.toLocaleString("vi-VN")} ₫ cho mọi đơn).
          </li>
          <li>
            Thanh toán: <b>{siteConfig.paymentLabel}</b>.
          </li>
        </ul>
        <p className="text-xs text-neutral-500">
          Hai mục này gắn với cách tính tiền và lưu đơn hàng, nên chỉ đổi được bằng cách sửa mã nguồn (cả logic đặt hàng),
          để số tiền khách trả luôn khớp nội dung hiển thị. Đổi chữ trong Trang nội dung không làm thay đổi phí hay cách
          thanh toán.
        </p>
      </section>
    </>
  );
}
