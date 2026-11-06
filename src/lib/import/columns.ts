/** Các cột của file CSV nhập sản phẩm (dùng cho kiểm tra dữ liệu và trang hướng dẫn). */

export type ImportColumn = {
  key: string;
  required: "always" | "new" | "no";
  description: string;
  example: string;
};

export const IMPORT_COLUMNS: ImportColumn[] = [
  { key: "nguon", required: "always", description: "Mã nguồn hàng: chữ thường không dấu, số, gạch ngang.", example: "techmall" },
  {
    key: "ma_san_pham",
    required: "always",
    description: "Mã sản phẩm của nguồn. Các dòng cùng nguồn + mã là các phiên bản của một sản phẩm.",
    example: "BS-PB-10K",
  },
  { key: "sku", required: "always", description: "Mã SKU của phiên bản, duy nhất toàn hệ thống (2–40 ký tự in hoa, số, - _).", example: "BS-PB-10K-DEN" },
  { key: "ten_san_pham", required: "new", description: "Tên sản phẩm. Bắt buộc khi tạo sản phẩm mới.", example: "Sạc dự phòng 10000mAh" },
  {
    key: "danh_muc",
    required: "new",
    description: "Đường dẫn danh mục theo tên, phân cấp bằng “>”. Danh mục chưa có sẽ được tạo mới (mặc định Hiện).",
    example: "Điện tử > Phụ kiện sạc",
  },
  { key: "thuong_hieu", required: "no", description: "Thương hiệu.", example: "Baseus" },
  { key: "mo_ta_ngan", required: "no", description: "Mô tả ngắn (tối đa 300 ký tự).", example: "Sạc nhanh 20W" },
  { key: "mo_ta", required: "no", description: "Mô tả chi tiết, văn bản thuần (tối đa 5.000 ký tự).", example: "..." },
  { key: "diem_noi_bat", required: "no", description: "Các điểm nổi bật, ngăn cách bằng “|” (tối đa 10).", example: "Sạc nhanh 20W|Màn hình LED" },
  { key: "thuoc_tinh_1", required: "no", description: "Tên thuộc tính biến thể 1 (để trống nếu không có biến thể).", example: "Màu sắc" },
  { key: "gia_tri_1", required: "no", description: "Giá trị thuộc tính 1 của dòng này.", example: "Đen" },
  { key: "thuoc_tinh_2", required: "no", description: "Tên thuộc tính 2 (tuỳ chọn).", example: "" },
  { key: "gia_tri_2", required: "no", description: "Giá trị thuộc tính 2.", example: "" },
  { key: "thuoc_tinh_3", required: "no", description: "Tên thuộc tính 3 (tuỳ chọn).", example: "" },
  { key: "gia_tri_3", required: "no", description: "Giá trị thuộc tính 3.", example: "" },
  {
    key: "gia_ban",
    required: "new",
    description: "Giá bán (VNĐ, số nguyên, vd. 459000 hoặc 459.000). Bắt buộc với SKU mới; để trống khi cập nhật = giữ nguyên.",
    example: "459000",
  },
  { key: "gia_niem_yet", required: "no", description: "Giá niêm yết (lớn hơn giá bán) để hiện giảm giá; để trống = giữ nguyên/không có.", example: "590000" },
  { key: "ton_kho", required: "new", description: "Tồn kho (số nguyên ≥ 0). Bắt buộc với SKU mới; để trống khi cập nhật = giữ nguyên.", example: "25" },
  {
    key: "gia_nhap",
    required: "no",
    description: "Giá nhập đại lý: chỉ lưu nội bộ để tham khảo, KHÔNG hiển thị ở cửa hàng và không bao giờ dùng làm giá bán.",
    example: "320000",
  },
  {
    key: "anh",
    required: "no",
    description: "URL ảnh http(s), nhiều ảnh ngăn cách bằng “|”. Ảnh được tải về, kiểm tra và chuyển sang WebP như ảnh tải lên.",
    example: "https://example.com/anh1.jpg|https://example.com/anh2.jpg",
  },
];

export const KNOWN_COLUMNS = new Set(IMPORT_COLUMNS.map((c) => c.key));
export const REQUIRED_HEADERS = IMPORT_COLUMNS.filter((c) => c.required === "always").map((c) => c.key);
