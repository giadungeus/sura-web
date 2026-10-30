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

## Trang quản trị đơn hàng (`/admin`)

### Thiết lập tài khoản quản trị (làm một lần, trên máy chạy website)

Không có đăng ký công khai. Tài khoản được tạo bằng lệnh trên máy:

```bash
npm run admin:setup
```

Lệnh hỏi **tên đăng nhập** (mặc định `admin`) và **mật khẩu** (gõ hai lần, không hiện trên màn hình; ít nhất 10 ký tự, không chứa tên đăng nhập).

- Hệ thống chỉ có **một quản trị viên**. Chạy lại lệnh sẽ thay tài khoản cũ, đổi mật khẩu và **đăng xuất mọi phiên**. Đây cũng là cách đặt lại khi quên mật khẩu hoặc mở khoá sớm sau khi nhập sai nhiều lần.
- Xoá tài khoản quản trị (không ảnh hưởng đơn hàng): `npm run admin:setup -- --xoa`
- Mật khẩu chỉ được lưu dưới dạng **băm scrypt** trong `.data/shop.sqlite`; không nằm trong mã nguồn hay Git.

### Sử dụng

1. Chạy website (`npm run build` rồi `npm run start`), mở http://localhost:3000/admin và đăng nhập.
2. **Danh sách đơn**: mới nhất trước, 20 đơn/trang. Tìm theo mã đơn (một phần, không phân biệt hoa thường) hoặc số điện thoại (một phần, chấp nhận dạng `0912 345 678` hay `+84…`). Lọc theo trạng thái, kèm số lượng.
3. **Chi tiết đơn**: sản phẩm, biến thể, số lượng, giá lúc đặt, tổng tiền, thông tin và ghi chú của khách, lịch sử trạng thái.
4. **Xử lý đơn** theo luồng: *Chờ xác nhận → Đã xác nhận → Đang giao → Hoàn thành*. Chỉ huỷ được khi đơn đang *Chờ xác nhận* hoặc *Đã xác nhận*, và bắt buộc nhập lý do (≥ 5 ký tự).
5. **Ghi chú nội bộ**: chỉ quản trị viên thấy. Khách chỉ thấy trạng thái đơn trên trang đơn của mình, không thấy ghi chú nội bộ hay lý do huỷ.
6. Chưa có chức năng xoá đơn.

### Bảo mật

- Mọi trang quản trị và mọi thao tác (Server Action) đều **kiểm tra phiên đăng nhập trên server**; không có API công khai cho đơn hàng.
- Phiên đăng nhập: cookie `httpOnly`, `SameSite=Strict`, chỉ gửi cho `/admin`; CSDL chỉ lưu mã băm của phiên. Hết hạn sau **8 giờ**, hoặc **2 giờ** không thao tác.
- Đăng nhập sai **5 lần trong 15 phút** thì khoá tài khoản đó 15 phút (tối đa 20 lần sai/15 phút cho mọi tài khoản). Thông báo lỗi giống nhau dù sai tên hay sai mật khẩu.
- Thao tác thay đổi dữ liệu: Next.js kiểm tra nguồn gửi (chống CSRF); server kiểm tra lại bước chuyển trạng thái hợp lệ và trạng thái hiện tại (tránh bấm hai lần hoặc hai tab cùng sửa).
- Trang `/admin` gửi kèm header chống nhúng iframe, không lưu cache, không lập chỉ mục.

## Dữ liệu được lưu ở đâu

| Dữ liệu | Nơi lưu |
|---|---|
| Danh mục, sản phẩm (dữ liệu mẫu) | `src/data/categories.ts`, `src/data/products.ts` |
| Giỏ hàng | `localStorage` của trình duyệt (khóa `shop-online-cart`) |
| **Đơn hàng, lịch sử trạng thái, ghi chú nội bộ** | **SQLite: `.data/shop.sqlite`** trong thư mục dự án (tự tạo ở lần chạy đầu tiên) |
| Tài khoản quản trị (mật khẩu đã băm), phiên đăng nhập, lượt thử đăng nhập | Cùng file `.data/shop.sqlite` |

- Đổi vị trí file CSDL bằng biến môi trường `SHOP_DB_PATH`, ví dụ (PowerShell):
  `$env:SHOP_DB_PATH = "D:\du-lieu\shop.sqlite"; npm run start`
- Thư mục `.data/` đã được loại khỏi Git (chứa thông tin khách hàng).
- Cấu trúc CSDL tự nâng cấp (migration) khi khởi động; dữ liệu cũ được giữ nguyên. Nên sao lưu file trước khi nâng cấp lớn.
- Muốn xoá toàn bộ dữ liệu thử nghiệm (kể cả tài khoản quản trị): dừng server rồi xoá thư mục `.data/`. CSDL sẽ được tạo lại trống.
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
scripts/admin-setup.mts  Lệnh `npm run admin:setup`
src/
  app/
    (shop)/            Các trang cửa hàng (dùng chung header/footer/giỏ hàng)
      thanh-toan/      Trang thanh toán + Server Actions (actions.ts)
      don-hang/[ma]/   Trang đặt hàng thành công của khách
    admin/
      dang-nhap/       Trang đăng nhập quản trị
      (bao-ve)/        Trang cần đăng nhập: danh sách đơn, chi tiết đơn
      actions.ts       Server Actions: đăng nhập/đăng xuất, đổi trạng thái, ghi chú
  components/          Giao diện dùng chung (layout, product, listing, ui)
  config/site.ts       Tên shop, chính sách vận chuyển, số sản phẩm/trang
  data/                Dữ liệu mẫu
  lib/checkout/        Kiểm tra thông tin khách (dùng chung client/server), kiểu dữ liệu
  lib/server/          Chỉ chạy trên server: db.ts, schema.ts (migration), orders.ts, pricing.ts,
                       admin-auth.ts (phiên, giới hạn đăng nhập), admin-orders.ts, password.ts
  lib/order-status.ts  Trạng thái đơn và luồng chuyển hợp lệ
  lib/data/catalog.ts  Lớp truy cập dữ liệu sản phẩm
  store/cart.ts        Giỏ hàng (zustand + localStorage)
```

## Mở rộng

- **Thêm ngành hàng / sản phẩm:** sửa `src/data/categories.ts` và `src/data/products.ts`.
- **Đổi chính sách vận chuyển:** `siteConfig.shipping` và hàm `calculateShipping` trong `src/lib/server/pricing.ts`.
- **Đổi cấu trúc bảng:** thêm một phần tử mới vào `MIGRATIONS` trong `src/lib/server/db.ts` (không sửa migration cũ).
- **Đổi màu thương hiệu:** biến `--color-brand-*` trong `src/app/globals.css`.

## Chưa có (giai đoạn sau)

Thanh toán online, quản lý sản phẩm, trừ tồn kho thật, xoá đơn, nhiều tài khoản/phân quyền, xác thực hai lớp, gửi email/SMS xác nhận, giới hạn tần suất đặt đơn, xuất báo cáo. Triển khai Internet: khi đó cần HTTPS và bật cookie `secure`, đặt giới hạn đăng nhập theo IP thật (sau proxy), sao lưu CSDL định kỳ.
