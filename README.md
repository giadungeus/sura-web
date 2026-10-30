# Shop Online

Website bán hàng đa ngành xây bằng **Next.js 16 (App Router)**, **TypeScript** và **Tailwind CSS 4**.
Giao diện tiếng Việt, tiền tệ VNĐ, ưu tiên điện thoại.

## Chạy dự án

```bash
npm install
npm run dev      # chế độ phát triển: http://localhost:3000
npm run build    # build production
npm run start    # chạy bản production đã build
npm run lint     # kiểm tra ESLint
```

Kiểm tra TypeScript: `npx next typegen && npx tsc --noEmit`

## Giai đoạn 1 (đã có)

| Trang | Đường dẫn |
|---|---|
| Trang chủ | `/` |
| Danh mục (lọc giá, thương hiệu, sắp xếp, phân trang) | `/danh-muc/[slug]` |
| Chi tiết sản phẩm (biến thể, số lượng, thêm vào giỏ) | `/san-pham/[slug]` |
| Tìm kiếm không dấu | `/tim-kiem?q=...` |
| Giỏ hàng (lưu trong trình duyệt) | `/gio-hang` |

Dữ liệu mẫu: 24 sản phẩm, 6 ngành hàng, 12 danh mục con. Chưa có cơ sở dữ liệu, đăng nhập, thanh toán, trang quản trị.

## Cấu trúc

```
src/
  app/              Các trang (App Router)
  components/       Giao diện dùng chung (layout, product, listing, ui)
  config/site.ts    Tên shop, phí vận chuyển, ngưỡng miễn phí, số sản phẩm/trang
  data/             Dữ liệu mẫu: categories.ts, products.ts
  lib/data/         Lớp truy cập dữ liệu (thay bằng CSDL ở giai đoạn sau)
  lib/listing.ts    Lọc / sắp xếp / phân trang theo tham số URL
  lib/search.ts     Chuẩn hóa tiếng Việt cho tìm kiếm không dấu
  lib/format.ts     Định dạng VNĐ
  store/cart.ts     Giỏ hàng (zustand + localStorage)
  types/            Kiểu dữ liệu
```

## Mở rộng

- **Thêm ngành hàng:** thêm danh mục vào `src/data/categories.ts` kèm `attributes` (thông số riêng của ngành). Không cần sửa giao diện.
- **Thêm sản phẩm:** thêm vào `src/data/products.ts`; `specs` dùng đúng `key` của `attributes` trong danh mục.
- **Kết nối cơ sở dữ liệu:** chỉ thay phần thân các hàm trong `src/lib/data/catalog.ts`.
- **Đổi màu thương hiệu:** sửa các biến `--color-brand-*` trong `src/app/globals.css`.
