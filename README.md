# Shop Online

Website bán hàng đa ngành xây bằng **Next.js 16 (App Router)**, **TypeScript** và **Tailwind CSS 4**.
Giao diện tiếng Việt, tiền tệ VNĐ, ưu tiên điện thoại. Hiện chỉ chạy trên máy (localhost), chưa triển khai Internet.

## Yêu cầu

- **Node.js 22.13 trở lên** (khuyên dùng bản mới; dự án đang chạy với Node 26). Cơ sở dữ liệu dùng module `node:sqlite` có sẵn trong Node.js, **không cần cài thêm phần mềm CSDL**.

## Chạy dự án

```bash
npm install
npm run dev      # chế độ phát triển: http://localhost:3000
npm run build    # build production
npm run start    # chạy bản production đã build: http://localhost:3000
npm run lint     # kiểm tra ESLint
```

Kiểm tra TypeScript: `npx next typegen && npx tsc --noEmit`

## Dữ liệu được lưu ở đâu

| Dữ liệu | Nơi lưu |
|---|---|
| Danh mục, sản phẩm (dữ liệu mẫu) | `src/data/categories.ts`, `src/data/products.ts` |
| Giỏ hàng | `localStorage` của trình duyệt (khóa `shop-online-cart`) |
| **Đơn hàng** | **SQLite: `.data/shop.sqlite`** trong thư mục dự án (tự tạo ở lần đặt hàng đầu tiên) |

- Đổi vị trí file CSDL bằng biến môi trường `SHOP_DB_PATH`, ví dụ (PowerShell):
  `$env:SHOP_DB_PATH = "D:\du-lieu\shop.sqlite"; npm run start`
- Thư mục `.data/` đã được loại khỏi Git (chứa thông tin khách hàng).
- Muốn xoá toàn bộ đơn thử nghiệm: dừng server rồi xoá thư mục `.data/`. CSDL sẽ được tạo lại trống.
- Có thể mở file `.data/shop.sqlite` bằng công cụ như *DB Browser for SQLite* để xem đơn (chỉ trên máy).

## Chức năng

### Giai đoạn 1
| Trang | Đường dẫn |
|---|---|
| Trang chủ | `/` |
| Danh mục (lọc giá, thương hiệu, sắp xếp, phân trang) | `/danh-muc/[slug]` |
| Chi tiết sản phẩm (biến thể, số lượng, thêm vào giỏ) | `/san-pham/[slug]` |
| Tìm kiếm không dấu | `/tim-kiem?q=...` |
| Giỏ hàng | `/gio-hang` |

### Giai đoạn 2: đặt hàng thử nghiệm (COD)
| Trang | Đường dẫn |
|---|---|
| Thanh toán | `/thanh-toan` |
| Đặt hàng thành công | `/don-hang/[mã đơn]` |

- Form: họ tên, số điện thoại (di động Việt Nam 10 số), địa chỉ, ghi chú. Kiểm tra ở cả trình duyệt và server, báo lỗi tiếng Việt.
- Chỉ thanh toán khi nhận hàng (COD). Vận chuyển: *Miễn phí vận chuyển — áp dụng cho bản thử nghiệm* (`src/config/site.ts`).
- **Server tự tính giá** từ dữ liệu sản phẩm, không dùng giá/tổng tiền trình duyệt gửi lên; kiểm tra sản phẩm, biến thể và tồn kho trước khi lưu.
- **Chống đơn trùng:** mỗi lần thanh toán có một khóa (idempotency key); bấm nhiều lần hoặc gửi lại sau lỗi mạng chỉ tạo một đơn.
- Giỏ hàng chỉ bị xoá sau khi đơn đã lưu thành công.
- **Bảo vệ thông tin:** không có trang liệt kê đơn. Trang đơn hàng chỉ xem được trên trình duyệt đã đặt (cookie `httpOnly` ký bằng khóa bí mật lưu trong CSDL).
- Mọi đơn được đánh dấu là đơn thử nghiệm, **không chuyển cho bên giao hàng**.

## Cấu trúc

```
src/
  app/
    thanh-toan/        Trang thanh toán + Server Actions (actions.ts)
    don-hang/[ma]/     Trang đặt hàng thành công
  components/          Giao diện dùng chung (layout, product, listing, ui)
  config/site.ts       Tên shop, chính sách vận chuyển, số sản phẩm/trang
  data/                Dữ liệu mẫu
  lib/checkout/        Kiểm tra thông tin khách (dùng chung client/server), kiểu dữ liệu
  lib/server/          Chỉ chạy trên server: db.ts (SQLite), orders.ts, pricing.ts
  lib/data/catalog.ts  Lớp truy cập dữ liệu sản phẩm
  store/cart.ts        Giỏ hàng (zustand + localStorage)
```

## Mở rộng

- **Thêm ngành hàng / sản phẩm:** sửa `src/data/categories.ts` và `src/data/products.ts`.
- **Đổi chính sách vận chuyển:** `siteConfig.shipping` và hàm `calculateShipping` trong `src/lib/server/pricing.ts`.
- **Đổi cấu trúc bảng:** thêm một phần tử mới vào `MIGRATIONS` trong `src/lib/server/db.ts` (không sửa migration cũ).
- **Đổi màu thương hiệu:** biến `--color-brand-*` trong `src/app/globals.css`.

## Chưa có (giai đoạn sau)

Thanh toán online, trừ tồn kho thật, trang quản trị đơn, đăng nhập, gửi email/SMS xác nhận, giới hạn tần suất đặt đơn, triển khai Internet (khi đó cần bật cookie `secure` và dùng CSDL phù hợp với máy chủ).
