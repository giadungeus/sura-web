import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Ảnh tải lên từng tệp một qua Server Action (tối đa 5 MB/ảnh + phần đầu multipart).
    serverActions: { bodySizeLimit: "6mb" },
    // Build chỉ dùng 1 worker: hosting cPanel báo nhiều CPU (34) nhưng giới hạn RAM thấp,
    // build mặc định bị dừng với mã 137 (hết bộ nhớ). Build chậm hơn trên máy nhưng ổn định trên hosting.
    cpus: 1,
  },
  async headers() {
    // Trang quản trị: không cho nhúng iframe (chống clickjacking), không lưu cache, không lập chỉ mục.
    const adminHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
      { key: "Cache-Control", value: "private, no-store" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Referrer-Policy", value: "same-origin" },
    ];
    return [
      { source: "/admin", headers: adminHeaders },
      { source: "/admin/:path*", headers: adminHeaders },
    ];
  },
  // Tailwind được xử lý qua postcss.config.mjs (dùng chung cho Turbopack và webpack).
};

export default nextConfig;
