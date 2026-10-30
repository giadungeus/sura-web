export const siteConfig = {
  name: "Shop Online",
  description:
    "Mua sắm đa ngành: điện tử, thời trang, nhà cửa, sắc đẹp, mẹ & bé, thể thao. Giá tốt, giao nhanh toàn quốc.",
  /** Chính sách vận chuyển. Chưa có chính sách thật nên miễn phí cho bản thử nghiệm. */
  shipping: {
    fee: 0,
    label: "Miễn phí vận chuyển — áp dụng cho bản thử nghiệm",
    shortLabel: "Miễn phí vận chuyển (bản thử nghiệm)",
  },
  /** Số sản phẩm mỗi trang ở trang danh mục và tìm kiếm. */
  pageSize: 12,
} as const;
