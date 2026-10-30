export const siteConfig = {
  name: "Shop Online",
  description:
    "Mua sắm đa ngành: điện tử, thời trang, nhà cửa, sắc đẹp, mẹ & bé, thể thao. Giá tốt, giao nhanh toàn quốc.",
  /** Đơn hàng từ mức này được miễn phí vận chuyển (VNĐ). */
  freeShippingThreshold: 500_000,
  /** Phí vận chuyển mặc định (VNĐ). */
  shippingFee: 30_000,
  /** Số sản phẩm mỗi trang ở trang danh mục và tìm kiếm. */
  pageSize: 12,
} as const;
