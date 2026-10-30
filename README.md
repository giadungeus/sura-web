# Shop Online

Website bán hàng đa ngành xây bằng **Next.js 16 (App Router)**, **TypeScript** và **Tailwind CSS 4**.
Giao diện tiếng Việt, tiền tệ VNĐ, ưu tiên điện thoại. Hiện chỉ chạy trên máy (localhost), chưa triển khai Internet.

## Yêu cầu

- **Node.js 22.13 trở lên** (khuyên dùng bản mới; dự án đang chạy với Node 26). Cơ sở dữ liệu dùng module `node:sqlite` có sẵn trong Node.js, **không cần cài thêm phần mềm CSDL**.
- Ảnh tải lên được xử lý bằng thư viện `sharp` (cài tự động qua `npm install`).

## Chạy dự án

```bash
npm install
npm run dev      # chế độ phát triển: http://localhost:3000
npm run build    # build production
npm run start    # chạy bản production đã build: http://localhost:3000
npm run lint     # kiểm tra ESLint
```

Kiểm tra TypeScript: `npx next typegen && npx tsc --noEmit`

Sửa sản phẩm, danh mục, giá, tồn kho trong trang quản trị thì **cửa hàng cập nhật ngay, không cần build lại**.

## Dữ liệu được lưu ở đâu

| Dữ liệu | Nơi lưu |
|---|---|
| **Danh mục, sản phẩm, biến thể (SKU/giá/tồn kho), đơn hàng, lịch sử, ghi chú nội bộ, tài khoản quản trị** | **SQLite: `.data/shop.sqlite`** (tự tạo ở lần chạy đầu tiên) |
| **Ảnh sản phẩm tải lên** | **`.data/uploads/products/`** (tên tệp ngẫu nhiên do server tạo, định dạng WebP) |
| Giỏ hàng | `localStorage` của trình duyệt (khoá `shop-online-cart`) |
| Dữ liệu mẫu ban đầu | `src/data/categories.ts`, `src/data/products.ts` (chỉ dùng cho bước nhập) |

- Đổi vị trí: biến môi trường `SHOP_DB_PATH` (file CSDL) và `SHOP_UPLOAD_DIR` (thư mục ảnh). Ví dụ (PowerShell):
  `$env:SHOP_DB_PATH = "D:\du-lieu\shop.sqlite"; $env:SHOP_UPLOAD_DIR = "D:\du-lieu\anh"; npm run start`
- Thư mục `.data/` đã được loại khỏi Git (chứa thông tin khách hàng, mật khẩu đã băm, ảnh).
- Cấu trúc CSDL tự nâng cấp (migration) khi khởi động; dữ liệu cũ được giữ nguyên.
- **Sao lưu:** dừng server rồi sao chép cả thư mục `.data/` (gồm `shop.sqlite`, các tệp `shop.sqlite-wal`/`-shm` nếu có, và `uploads/`).
- Muốn xoá toàn bộ dữ liệu thử nghiệm: dừng server rồi xoá `.data/`. Lần chạy sau sẽ tạo CSDL mới và nhập lại sản phẩm mẫu.

### Nhập sản phẩm mẫu vào CSDL

Lần đầu khởi động, website tự nhập 18 danh mục và 24 sản phẩm mẫu (giữ nguyên mã `p01`…`p24` và slug để liên kết với đơn cũ). Có thể chạy lại thủ công:

```bash
npm run catalog:import
```

Lệnh chạy lại bao nhiêu lần cũng được: danh mục/sản phẩm đã có (theo slug/mã) được **bỏ qua**, không tạo trùng và không ghi đè chỉnh sửa trong trang quản trị.

## Trang quản trị (`/admin`)

### Thiết lập tài khoản quản trị (làm một lần, trên máy chạy website)

Không có đăng ký công khai. Tài khoản được tạo bằng lệnh trên máy:

```bash
npm run admin:setup
```

Lệnh hỏi **tên đăng nhập** (mặc định `admin`) và **mật khẩu** (gõ hai lần, không hiện trên màn hình; ít nhất 10 ký tự, không chứa tên đăng nhập).

- Hệ thống chỉ có **một quản trị viên**. Chạy lại lệnh sẽ thay tài khoản cũ, đổi mật khẩu và **đăng xuất mọi phiên**. Đây cũng là cách đặt lại khi quên mật khẩu hoặc mở khoá sớm sau khi nhập sai nhiều lần.
- Xoá tài khoản quản trị (không ảnh hưởng đơn hàng): `npm run admin:setup -- --xoa`
- Mật khẩu chỉ được lưu dưới dạng **băm scrypt** trong `.data/shop.sqlite`; không nằm trong mã nguồn hay Git.

### Đơn hàng (`/admin`)

1. **Danh sách đơn**: mới nhất trước, 20 đơn/trang. Tìm theo mã đơn hoặc số điện thoại; lọc theo trạng thái.
2. **Chi tiết đơn**: sản phẩm, biến thể, SKU, số lượng, giá lúc đặt, tổng tiền, thông tin và ghi chú của khách, lịch sử trạng thái, tình trạng kho của đơn.
3. **Xử lý đơn**: *Chờ xác nhận → Đã xác nhận → Đang giao → Hoàn thành*. Chỉ huỷ được khi *Chờ xác nhận* hoặc *Đã xác nhận*, bắt buộc nhập lý do.
4. **Ghi chú nội bộ**: chỉ quản trị viên thấy. Chưa có chức năng xoá đơn.

### Danh mục (`/admin/danh-muc`)

- Thêm, sửa tên, slug, danh mục cha, thứ tự (số nhỏ đứng trước), biểu tượng; bật/tắt hiển thị.
- Slug không được trùng. **Ẩn danh mục** sẽ ẩn cả danh mục con và sản phẩm bên trong (không xem, không đặt mua được).
- Chỉ **xoá** được danh mục không còn sản phẩm và không còn danh mục con.

### Sản phẩm (`/admin/san-pham`)

- Danh sách 20 sản phẩm/trang; tìm theo tên, thương hiệu, slug hoặc SKU; lọc theo danh mục (gồm danh mục con) và trạng thái (đang hiện / đang ẩn / hết hàng). Ẩn/hiện nhanh ngay trong danh sách.
- **Thêm / sửa sản phẩm**: tên, slug (tự sinh từ tên, có thể sửa, không được trùng), danh mục, thương hiệu, mô tả ngắn, mô tả chi tiết, điểm nổi bật, ảnh.
- **Giá và tồn kho**:
  - *Không có biến thể*: một dòng SKU – giá bán – giá niêm yết (tuỳ chọn) – tồn kho.
  - *Có biến thể*: nhập tối đa 3 thuộc tính (vd. `Màu sắc`, `Size`) và các giá trị cách nhau bằng dấu phẩy, bấm **Tạo các phiên bản** để sinh tổ hợp; mỗi phiên bản có SKU riêng, giá, tồn kho.
  - Server kiểm tra: SKU duy nhất toàn hệ thống (2–40 ký tự in hoa, số, `-`, `_`), giá bán là số nguyên 1.000 – 10.000.000.000 ₫, giá niêm yết lớn hơn giá bán, tồn kho 0 – 1.000.000, không trùng tổ hợp thuộc tính.
  - Phiên bản đã có trong đơn hàng mà bị bỏ khỏi form sẽ được **ẩn** (không xoá) để vẫn hoàn kho được khi huỷ đơn.
- **Ảnh**: bấm **Tải ảnh lên** (chọn được nhiều ảnh), xem trước, đổi thứ tự bằng mũi tên, bấm ★ để chọn **ảnh đại diện**, bấm × để bỏ. Ảnh chỉ gắn vào sản phẩm khi bấm **Lưu**.
  - Chỉ nhận **JPEG, PNG, WebP**, tối đa **5 MB/ảnh**, **10 ảnh/sản phẩm**, cạnh ngắn ≥ 100px.
  - Server kiểm tra nội dung tệp thật (không tin đuôi tệp), giải mã lại ảnh, xoay đúng chiều, thu nhỏ tối đa 2000px, **xoá EXIF/vị trí GPS** và lưu dạng WebP với tên ngẫu nhiên.
- **Mô tả** là văn bản thuần: mã HTML/JavaScript được hiển thị như chữ, không được thực thi.
- Đơn hàng lưu **ảnh chụp tên, biến thể, giá tại thời điểm đặt**: sửa sản phẩm không làm thay đổi đơn cũ.

### Tồn kho khi đặt hàng

- Khi khách đặt hàng, server kiểm tra và **trừ tồn kho trong cùng giao dịch lưu đơn**; câu lệnh trừ kho có điều kiện `tồn kho ≥ số lượng`, nên nhiều người đặt cùng lúc **không thể bán vượt tồn**.
- Gửi lại yêu cầu đặt hàng (bấm nhiều lần, mạng chập chờn) trả về đơn đã tạo, **không trừ kho lần nữa**.
- **Huỷ đơn** (trong trang quản trị) hoàn kho **đúng một lần**.
- Đơn thử nghiệm tạo trước khi có quản lý kho được đánh dấu riêng: **không tự trừ hay hoàn kho**.
- Sản phẩm bị ẩn (hoặc thuộc danh mục bị ẩn) không đặt mua được, kể cả khi đã nằm trong giỏ.

### Bảo mật

- Mọi trang quản trị và mọi thao tác (Server Action, kể cả tải ảnh) đều **kiểm tra phiên đăng nhập trên server**.
- Phiên đăng nhập: cookie `httpOnly`, `SameSite=Strict`, chỉ gửi cho `/admin`; CSDL chỉ lưu mã băm của phiên. Hết hạn sau **8 giờ**, hoặc **2 giờ** không thao tác.
- Đăng nhập sai **5 lần trong 15 phút** thì khoá tài khoản đó 15 phút. Thông báo lỗi giống nhau dù sai tên hay sai mật khẩu.
- Next.js kiểm tra nguồn gửi của Server Action (chống CSRF); trang `/admin` có header chống nhúng iframe, không lưu cache, không lập chỉ mục.
- Ảnh được phục vụ qua `/anh/<tên>.webp`; tên tệp bị kiểm tra chặt nên không đọc được tệp nào khác.

## Trang cửa hàng

| Trang | Đường dẫn |
|---|---|
| Trang chủ | `/` |
| Danh mục (lọc giá, thương hiệu, sắp xếp, phân trang) | `/danh-muc/[slug]` |
| Chi tiết sản phẩm (ảnh, biến thể, tồn kho, thêm vào giỏ) | `/san-pham/[slug]` |
| Tìm kiếm không dấu (tên, thương hiệu, danh mục, SKU) | `/tim-kiem?q=...` |
| Giỏ hàng | `/gio-hang` |
| Thanh toán (COD, miễn phí vận chuyển cho bản thử nghiệm) | `/thanh-toan` |
| Đơn hàng của khách (chỉ xem được trên trình duyệt đã đặt) | `/don-hang/[mã đơn]` |

## Cấu trúc

```
scripts/
  admin-setup.mts      Lệnh `npm run admin:setup`
  catalog-import.mts   Lệnh `npm run catalog:import`
src/
  app/
    (shop)/            Các trang cửa hàng
    admin/
      dang-nhap/       Đăng nhập quản trị
      (bao-ve)/        Trang cần đăng nhập: đơn hàng, sản phẩm, danh mục
      actions.ts       Đăng nhập/đăng xuất, trạng thái đơn, ghi chú
      catalog-actions.ts  Danh mục, sản phẩm, tải ảnh
    anh/[file]/        Phục vụ ảnh sản phẩm đã tải lên
  components/          Giao diện dùng chung (layout, product, listing, ui, admin)
  config/site.ts       Tên shop, chính sách vận chuyển
  data/                Dữ liệu mẫu (nguồn cho bước nhập)
  lib/data/catalog.ts  Đọc danh mục/sản phẩm cho cửa hàng (từ CSDL)
  lib/server/          Chỉ chạy trên server: db, schema (migration), catalog-seed, orders, pricing,
                       images, admin-auth, admin-orders, admin-catalog, password
  store/cart.ts        Giỏ hàng (zustand + localStorage)
```

## Chưa có (giai đoạn sau)

Thanh toán online, nhiều tài khoản/phân quyền, xác thực hai lớp, xoá sản phẩm, sửa thông số kỹ thuật (bảng thông số theo danh mục) trong quản trị, nhập/xuất sản phẩm hàng loạt, dọn ảnh không còn dùng, gửi email/SMS, giới hạn tần suất đặt đơn, báo cáo. Triển khai Internet: cần HTTPS và bật cookie `secure`, giới hạn đăng nhập theo IP thật, CSDL/ổ lưu ảnh và sao lưu phù hợp với máy chủ.
