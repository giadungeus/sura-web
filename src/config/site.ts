/**
 * Hằng số vận hành gắn với logic đơn hàng — KHÔNG sửa trong quản trị.
 *
 * Tên thương hiệu, đơn vị vận hành, hotline, Zalo, email, địa chỉ, giờ hỗ trợ và mô tả chân trang
 * được sửa ở Quản trị → Cài đặt website (bảng site_settings; mặc định: src/lib/content/settings.ts).
 *
 * Phí giao hàng được server dùng để tính tiền đơn (src/lib/server/pricing.ts). Đổi phí hay thêm
 * phương thức thanh toán phải sửa cả logic đặt hàng, không chỉ sửa chữ.
 */
export const siteConfig = {
  description: "Mua sắm đa ngành: điện tử, thời trang, nhà cửa, sắc đẹp, mẹ & bé, thể thao. Miễn phí giao hàng toàn quốc.",
  /** Phí giao hàng áp dụng cho mọi đơn (được tính lại ở server khi đặt hàng). */
  shipping: {
    fee: 0,
    label: "Miễn phí giao hàng toàn quốc",
    shortLabel: "Miễn phí giao hàng toàn quốc",
  },
  /** Phương thức thanh toán duy nhất đang hỗ trợ (orders.payment_method = 'COD'). */
  paymentLabel: "Thanh toán khi nhận hàng (COD)",
  warrantyLabel: "Bảo hành theo chính sách của từng thương hiệu",
  /** Số sản phẩm mỗi trang ở trang danh mục và tìm kiếm. */
  pageSize: 12,
} as const;
