# Sura

Website bán hàng đa ngành xây bằng **Next.js 16 (App Router)**, **TypeScript** và **Tailwind CSS 4**.
Website Sura do Công ty Ricotech vận hành. Giao diện tiếng Việt, tiền tệ VNĐ, ưu tiên điện thoại. (Tên kỹ thuật `shop-online` của thư mục, gói npm, khoá giỏ hàng và CSDL được giữ nguyên để không mất dữ liệu cũ.) Đang chạy thử trên https://sura.vn (hosting iNET cPanel) và trên máy tính; **dữ liệu hai nơi tách biệt**.

## Yêu cầu

- **Node.js 22.18 trở lên** (máy tính: Node 26; hosting: Node 22.23). Cơ sở dữ liệu dùng module `node:sqlite` có sẵn trong Node.js, **không cần cài thêm phần mềm CSDL**. Các lệnh `npm run admin:setup / catalog:import / backup` chạy tệp `.mts` trực tiếp nên cần Node ≥ 22.18.
- Ảnh tải lên được xử lý bằng thư viện `sharp` (cài tự động qua `npm install`).
- Tailwind CSS 4 chạy qua PostCSS (`postcss.config.mjs` + `@tailwindcss/postcss`), dùng được cho cả Turbopack lẫn webpack.

## Chạy dự án

```bash
npm install
npm run dev            # chế độ phát triển: http://localhost:3000
npm run build          # build production bằng Turbopack (máy tính)
npm run build:webpack  # build production bằng webpack (hosting không chạy được Turbopack)
npm run start          # chạy bản production đã build: http://localhost:3000
npm run start:app      # chạy qua app.js (giống hosting cPanel)
npm run lint           # kiểm tra ESLint
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
- Đường dẫn tuyệt đối mặc định trên máy này: CSDL `C:\Users\PC\Desktop\Code web\shop-online\.data\shop.sqlite`, ảnh `C:\Users\PC\Desktop\Code web\shop-online\.data\uploads\products\` (thư mục ảnh được tạo khi tải ảnh đầu tiên). Đường dẫn tính theo **thư mục chạy lệnh** `npm run start`, nên luôn chạy lệnh trong thư mục dự án.

### Sao lưu và khôi phục

**Sao lưu (chạy được khi website đang chạy):**

```bash
npm run backup                         # → .data/backups/<thời-gian>/
npm run backup -- --dest "D:\SaoLuu"   # → D:\SaoLuu\<thời-gian>/ (nên lưu ra ổ/thiết bị khác)
```

- CSDL được chụp bằng API sao lưu của SQLite: bản chụp **nhất quán**, gồm cả dữ liệu còn nằm trong tệp `shop.sqlite-wal`, và được gộp thành **một tệp `shop.sqlite` duy nhất**. Không sao chép riêng tệp `shop.sqlite` khi server đang chạy: dữ liệu mới có thể vẫn nằm trong tệp `-wal`.
- Ảnh được chép **sau** khi chụp CSDL (ảnh luôn được ghi ra đĩa trước khi CSDL ghi nhận và không bao giờ bị ghi đè), nên mọi ảnh mà bản sao CSDL nhắc tới đều có mặt.
- Lệnh kiểm tra `integrity_check`, đối chiếu ảnh và ghi `thong-tin-sao-luu.json`. Nếu CSDL lỗi hoặc thiếu tệp ảnh, lệnh báo rõ và kết thúc với mã lỗi.

**Khôi phục:** dừng server → đổi tên `.data/shop.sqlite` cũ và xoá `.data/shop.sqlite-wal`, `.data/shop.sqlite-shm` (nếu có) → chép `shop.sqlite` từ bản sao lưu vào `.data/` → chép nội dung `uploads/products/` của bản sao lưu vào `.data/uploads/products/` → chạy lại `npm run start`.
- Muốn xoá toàn bộ dữ liệu thử nghiệm: dừng server rồi xoá `.data/`. Lần chạy sau sẽ tạo CSDL mới và nhập lại sản phẩm mẫu.

### Nhập sản phẩm mẫu vào CSDL

Lần đầu khởi động, website tự nhập 18 danh mục và 24 sản phẩm mẫu (giữ nguyên mã `p01`…`p24` và slug để liên kết với đơn cũ). Có thể chạy lại thủ công:

```bash
npm run catalog:import
```

Lệnh chạy lại bao nhiêu lần cũng được: danh mục/sản phẩm đã có (theo slug/mã) được **bỏ qua**, không tạo trùng và không ghi đè chỉnh sửa trong trang quản trị.

## Triển khai lên hosting cPanel (sura.vn)

Hosting iNET dùng **cPanel → Setup Node.js App** (Phusion Passenger). iNET xác nhận hosting chưa hỗ trợ Node.js đầy đủ; các bước dưới đây là cách đã chạy được.

| Mục | Giá trị |
|---|---|
| Application root | `~/sura-shop` |
| Node.js | 22.23.4, chế độ **Production** |
| Startup file | `app.js` — **giống hệt bản đang chạy trên hosting** (đã đối chiếu); tạo HTTP server và chuyển yêu cầu cho Next.js |
| Build | `npm run build:webpack` — **không** dùng `npm run build` (Turbopack cần SWC bản native, đòi GLIBC 2.29 mà hosting không có) |
| Số worker khi build | `experimental.cpus: 1` trong `next.config.ts`. Hosting báo 34 CPU nhưng giới hạn RAM thấp; build mặc định nhiều worker bị dừng với **mã 137 (hết bộ nhớ)**. Với 1 worker, build hoàn tất 32/32 trang. Không bỏ dòng này. |
| CSS | `postcss.config.mjs` + `@tailwindcss/postcss` (đã có trong mã nguồn và `package.json`) |
| Dữ liệu | `~/sura-shop/.data/` (CSDL + ảnh) — tính theo thư mục ứng dụng; **không bao giờ** chép `.data/` giữa máy tính và hosting |

**Mỗi lần triển khai bản mới:**

1. Trên hosting, **sao lưu trước**: mở Terminal của cPanel, vào môi trường Node của ứng dụng (lệnh `source …/activate` mà trang Setup Node.js App hiển thị), rồi `cd ~/sura-shop && npm run backup -- --dest ~/sura-shop-backups`.
2. Tải mã nguồn mới lên `~/sura-shop`, **trừ** `.data/`, `node_modules/`, `.next/`, `.git/`, tệp `.zip`. Phải tải **cả `package.json` và `package-lock.json`** của mã nguồn: bản trên hosting còn ghi `@tailwindcss/turbopack` và thiếu `@tailwindcss/postcss`, `postcss` — nếu giữ bản cũ, “Run NPM Install” có thể gỡ hai gói này và build mất CSS.
3. Trang Setup Node.js App → **Run NPM Install** (cài cả devDependencies vì cần để build: Tailwind, TypeScript…).
4. Trong Terminal (môi trường Node của ứng dụng): `npm run build:webpack`.
5. Setup Node.js App → **Restart**. Khi khởi động, CSDL tự nâng cấp cấu trúc (migration) và giữ nguyên dữ liệu.
6. Kiểm tra `sharp` **trước khi** tải/nhập ảnh (mục bên dưới), rồi kiểm tra trang chủ, `/admin`, tải thử một ảnh trong quản trị.

**Lưu ý:**

- `app.js` lấy bản trên hosting làm mốc; đừng sửa nếu không cần.
- **Nên đặt biến môi trường `SHOP_SECURE_COOKIES=1`** trong Setup Node.js App (website chạy HTTPS): cookie đăng nhập quản trị và cookie xem đơn chỉ được gửi qua HTTPS. Không đặt biến này trên máy tính (chạy HTTP sẽ không đăng nhập được).
- Biến môi trường tuỳ chọn khác: `SHOP_DB_PATH`, `SHOP_UPLOAD_DIR`. **Không** đặt `SHOP_IMPORT_ALLOW_PRIVATE_HOSTS` trên hosting (chỉ dùng kiểm thử).

**Lấy `app.js` và `package-lock.json` đang chạy trên hosting để đối chiếu:** cPanel → **File Manager** → thư mục `sura-shop` → chọn tệp → **Download**; hoặc Terminal: `cat ~/sura-shop/app.js`.

### Kiểm tra sharp (xử lý ảnh) trên hosting

`sharp` dùng thư viện native cho Linux; cần thử thật trên hosting. Lệnh này **không** đọc/ghi CSDL hay `.data/`, chỉ ghi ảnh kết quả vào thư mục tạm:

1. Tải một ảnh JPEG/PNG bất kỳ (không chứa thông tin riêng tư) lên `~/anh-thu.jpg` bằng File Manager.
2. Terminal cPanel, vào môi trường Node của ứng dụng (`source …/activate`), rồi:
   ```bash
   cd ~/sura-shop && npm run check:sharp -- ~/anh-thu.jpg
   ```
3. Kết quả đạt: dòng cuối “✓ sharp hoạt động bình thường”, ảnh tự tạo được xoay/thu nhỏ đúng (1333×2000) và **đã xoá EXIF/GPS**. Lệnh in phiên bản Node, glibc, sharp, libvips và thời gian xử lý mỗi ảnh. Nếu báo “KHÔNG NẠP ĐƯỢC sharp” (thường do glibc/libvips), đừng dùng tải/nhập ảnh; gửi nguyên văn lỗi để xử lý.
4. Xoá `~/anh-thu.jpg` sau khi thử.

### Giới hạn thời gian khi nhập ảnh

- Bước **xác nhận nhập** không tải ảnh, chỉ ghi CSDL → rất nhanh.
- Ảnh được tải sau đó theo **từng lượt**: mỗi lượt là một yêu cầu riêng, 2 ảnh song song, ngừng nhận ảnh mới sau **15 giây** (biến `SHOP_IMPORT_IMAGE_BUDGET_MS`). Mỗi ảnh tối đa 15 giây tải (tính cả chuyển hướng, kể cả máy chủ gửi nhỏ giọt) + thời gian sharp xử lý. Vì vậy **một lượt dài nhất khoảng 15 + 15 + vài giây ≈ 35 giây**; thường ngắn hơn nhiều.
- Nếu hosting cắt yêu cầu sớm hơn (cần thử: nhập vài ảnh và xem log), đặt `SHOP_IMPORT_IMAGE_BUDGET_MS=5000` → lượt dài nhất ~25 giây. Bị cắt giữa chừng cũng không hỏng dữ liệu (xem dưới), chỉ chậm hơn.

## Nhập gói nội dung ZIP (`/admin/nhap-goi`)

Nhập bài sản phẩm (cho sản phẩm **đã có**), tin tức (tạo mới/cập nhật theo slug) và 9 trang nội dung từ một ZIP ≤ 10 MB: `goi.json` + `bai/*.md` + `anh/*`. Định dạng chi tiết cho người soạn: [`docs/goi-noi-dung/DINH-DANG.md`](docs/goi-noi-dung/DINH-DANG.md); gói mẫu: `docs/goi-noi-dung/goi-mau-sura.zip`; ghi chú kỹ thuật: `docs/goi-noi-dung/DE-XUAT.md`.

- Luồng: tải lên & kiểm tra → tối ưu ảnh theo lượt ngắn → **xem trước** đúng bố cục website (Tạo mới / Cập nhật / Giữ nguyên, trường thay đổi, khổ điện thoại) → xác nhận **Lưu nháp** (mặc định) hoặc **Công khai** trong **một giao dịch**; bấm lại không ghi trùng; **Bỏ lượt** xoá ảnh tạm.
- Lưu nháp không đổi nội dung khách thấy hay Ẩn/Hiện sản phẩm (sản phẩm: bản nháp riêng, **Áp dụng/Bỏ** trong trang sửa sản phẩm). Không bao giờ đổi giá, tồn kho, SKU, phiên bản, danh mục.
- Ảnh: WebP, ảnh đại diện/sản phẩm ≤ 1200 px (mục tiêu 50–150 KB), ảnh trong bài ≤ 1400 px (100–250 KB), tối đa 500 KB; không phóng to; ảnh không thể đạt mà vẫn rõ → báo thay. Ảnh giống hệt được dùng lại.
- An toàn: chỉ quản trị đăng nhập; ZIP đọc bằng thư viện `yauzl`, giới hạn số tệp/dung lượng/tỉ lệ nén, chặn `../`, đường dẫn tuyệt đối, tệp mã hoá, liên kết tượng trưng, tệp giả ảnh, HTML trong bài.
- Trình soạn (Trang nội dung, Tin tức, bài mô tả sản phẩm) có thêm **Chèn ảnh** và **Chèn bảng**; nội dung nhập từ gói sửa tiếp được như thường.
- **Hosting:** máy chủ web phải cho phép tải lên ≥ 10 MB tới `/admin/nhap-goi/tai-len` (chưa kiểm tra được). ZIP tạm nằm ở `.data/goi-tam/` và tự xoá.
- **SEO trong gói:** khoá tuỳ chọn `seo_title`, `seo_description` (không có = giữ; chuỗi = đặt; `""` = về mặc định; sai kiểu/`null` = lỗi). SEO đi cùng bản nháp, áp dụng cùng nội dung khi công khai. Chi tiết: mục 2.5 của `DINH-DANG.md`.

## Nhập sản phẩm hàng loạt từ CSV (`/admin/nhap-hang`)

Dùng cho nguồn hàng đại lý (Baseus, TechMall…). File mẫu: [`public/mau/nhap-san-pham-mau.csv`](public/mau/nhap-san-pham-mau.csv) (tải từ trang Nhập hàng); bảng mô tả đầy đủ các cột có ngay trên trang.

1. **Chọn file CSV UTF-8** (Excel: Lưu dưới dạng → “CSV UTF-8”), dấu phân cách `,` hoặc `;`, tối đa 2.000 dòng / 2 MB. Mỗi dòng là một phiên bản (SKU); các dòng cùng `nguon` + `ma_san_pham` là một sản phẩm.
2. **Xem trước**: thống kê thêm mới/cập nhật/giữ nguyên, danh mục sẽ tạo, số ảnh sẽ tải, **lỗi từng dòng** (số dòng + tên cột) và cảnh báo. Chưa ghi gì vào CSDL. Còn lỗi thì không xác nhận được. Trang ghi rõ: **sản phẩm/danh mục mới sẽ công khai (Hiện)**, trừ khi chọn “Tạo các mục mới ở trạng thái Ẩn”; mục đã có giữ nguyên trạng thái Hiện/Ẩn hiện tại (sản phẩm đang Ẩn nhập lại vẫn Ẩn).
3. **Xác nhận nhập**: hệ thống lập lại kế hoạch trên dữ liệu mới nhất và ghi tất cả (danh mục, sản phẩm, phiên bản, danh sách ảnh cần tải, trạng thái “đã nhập”) trong **một giao dịch**.
4. **Tải ảnh**: trình duyệt tự gọi các lượt ảnh ngắn và hiện tiến độ. Giữ trang mở tới khi xong; nếu đóng trang hoặc mất mạng, mở lại trang Nhập hàng và bấm **Tiếp tục tải ảnh**.

An toàn khi bị ngắt hoặc thử lại:

- **Ngắt khi đang xác nhận** (hosting dừng tiến trình, mất điện, lỗi): giao dịch bị huỷ hoàn toàn — không có sản phẩm, giá, tồn kho hay danh mục nào được ghi dở. Lượt nhập vẫn ở trạng thái xem trước; bấm xác nhận lại.
- **Bấm xác nhận nhiều lần / hai tab / mất phản hồi rồi bấm lại**: chỉ ghi một lần; các lần sau nhận lại đúng kết quả cũ (“đã được ghi từ trước”).
- **Ngắt khi đang tải ảnh**: ảnh đã gắn được giữ; ảnh đang tải dở được làm lại sau khi “giữ chỗ” hết hạn (60 giây). CSDL chặn gắn trùng cùng một URL cho cùng sản phẩm. Mỗi ảnh thử tối đa 3 lần nếu tiến trình liên tục bị ngắt. Có thể còn sót tệp ảnh không dùng trên đĩa nếu bị ngắt đúng sau khi lưu tệp — vô hại.
- **Nhập lại cùng file**: không tạo trùng sản phẩm/phiên bản/ảnh; chỉ những ảnh trước đó bị lỗi được xếp tải lại.

Quy tắc:

- Nhận diện sản phẩm theo **nguồn + mã sản phẩm**, phiên bản theo **SKU** → nhập lại cùng file không tạo trùng (báo “giữ nguyên”).
- **Sản phẩm mới luôn ẩn**, danh mục mới cũng ẩn; không bao giờ tự công khai. Sản phẩm đã có giữ nguyên trạng thái ẩn/hiện.
- **Không tự đặt giá hay tồn kho**: SKU mới thiếu `gia_ban`/`ton_kho` là lỗi; khi cập nhật, ô trống = giữ nguyên. Không xoá phiên bản/sản phẩm vắng mặt trong file.
- `gia_nhap` (giá nhập đại lý) chỉ lưu nội bộ trong CSDL, **không hiển thị ở cửa hàng** và không bao giờ dùng làm giá bán; có cảnh báo nếu giá bán thấp hơn giá nhập.
- SKU đang thuộc sản phẩm khác, thuộc tính không khớp, giá/tồn kho sai định dạng… đều báo lỗi theo dòng.
- **Ảnh từ URL** (`anh`, ngăn cách `|`): chỉ http/https; chặn địa chỉ nội bộ (localhost, mạng LAN, 169.254.x.x…) kể cả sau chuyển hướng; tối đa 15 giây, 5 MB, 10 ảnh/sản phẩm, 300 ảnh/lượt nhập; sau đó xử lý như ảnh tải lên (kiểm tra nội dung, xoá EXIF/GPS, WebP). Ảnh đã tải trước đó (cùng URL) không tải lại; ảnh lỗi được báo riêng và không chặn việc nhập.
- Chưa có công cụ tự thu thập dữ liệu TechMall; chỉ nhập từ file bạn cung cấp.

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

1. **Danh sách đơn**: mới nhất trước, 20 đơn/trang. Tìm theo mã đơn hoặc số điện thoại; lọc theo trạng thái; số đếm trên nút lọc và phân trang dùng cùng điều kiện lọc. Đầu trang có một ô **Đơn chờ xử lý** (gồm *Chờ xác nhận, Đã xác nhận, Đang giao*).
2. **Chi tiết đơn**: sản phẩm, biến thể, SKU, số lượng, giá lúc đặt, tổng tiền, thông tin và ghi chú của khách, lịch sử trạng thái, tình trạng kho của đơn.
3. **Xử lý đơn**: *Chờ xác nhận → Đã xác nhận → Đang giao → Hoàn thành*. Chỉ huỷ được khi *Chờ xác nhận* hoặc *Đã xác nhận*, bắt buộc nhập lý do.
4. **Ghi chú nội bộ**: chỉ quản trị viên thấy. Chưa có chức năng xoá đơn.

#### Ghi chú dữ liệu đơn

- Mọi đơn mới lưu `is_test = 0` (server ghi cố định). Cột `is_test` và các đơn cũ từ giai đoạn thử nghiệm được giữ nguyên trong CSDL, nhưng giao diện (quản trị và khách) không còn phân biệt Thật/Thử.
- Chống đơn trùng (khoá gửi lại) và trừ kho khi đặt / hoàn kho khi huỷ (đúng một lần) giữ nguyên cho mọi đơn.
- Website **không** tự chuyển đơn cho đơn vị vận chuyển hay gửi thông báo.

### Danh mục (`/admin/danh-muc`)

- Thêm, sửa tên, slug, danh mục cha, thứ tự (số nhỏ đứng trước), biểu tượng; bật/tắt hiển thị.
- **Biểu tượng**: 59 biểu tượng (lucide-react) chia 14 nhóm (điện tử, thời trang, nhà cửa, làm đẹp, mẹ & bé, thực phẩm, thể thao, du lịch, xe cộ, sách, thú cưng, công cụ, sân vườn, khác), tên tiếng Việt, ô tìm không phân biệt dấu. Mã biểu tượng lưu trong CSDL; 18 mã cũ giữ nguyên (`src/components/icons.tsx`).
- Slug không được trùng. **Ẩn danh mục** sẽ ẩn cả danh mục con và sản phẩm bên trong (không xem, không đặt mua được).
- Danh mục mới mặc định **Hiện** (bỏ chọn để tạo ở trạng thái Ẩn).
- **Thông tin danh mục** (tên, slug, cha, thứ tự, biểu tượng, Hiện/Ẩn) lưu ngay; **không** ghi mô tả ngắn, nội dung chi tiết hay SEO. Form tạo mới vẫn có ô mô tả ngắn.
- **Nội dung & SEO** (trang sửa danh mục): mô tả ngắn, nội dung chi tiết (trình soạn: H2/H3, danh sách, bảng, liên kết, ảnh có alt), tiêu đề/mô tả SEO kèm xem trước. **Lưu nháp** (khách vẫn thấy bản cũ, kể cả SEO) / **Công khai** (áp dụng tất cả cùng lúc, không đổi Hiện/Ẩn) / **Bỏ bản nháp**. Nội dung chi tiết hiện dưới danh sách sản phẩm và phân trang, chỉ ở trang đầu không lọc/sắp xếp; trống thì không hiện. Nhập CSV không bao giờ sửa danh mục đã có. Gói ZIP: loại `danh_muc` (xem `DINH-DANG.md` mục 2.6). CSDL v9 thêm cột `categories.body`, `categories.draft_json`.
- **Xoá danh mục**: nút ở cuối trang sửa, hỏi xác nhận kèm tên. Chỉ xoá được khi không còn sản phẩm (kể cả sản phẩm Ẩn) và không còn danh mục con; nếu còn, trang báo rõ cần chuyển/xử lý gì trước.

### Sản phẩm (`/admin/san-pham`)

- Danh sách 20 sản phẩm/trang; tìm theo tên, thương hiệu, slug hoặc SKU; lọc theo danh mục (gồm danh mục con) và trạng thái (đang hiện / đang ẩn / hết hàng). Ẩn/hiện nhanh ngay trong danh sách. Sản phẩm mới mặc định **Hiện** (bỏ chọn để tạo ở trạng thái Ẩn).
- **Xoá sản phẩm**: nút ở cuối trang sửa, hỏi xác nhận kèm tên. Chỉ xoá được sản phẩm **chưa có trong đơn hàng nào**: xoá sản phẩm, phiên bản và ảnh riêng của nó (ảnh còn được tin tức, trang nội dung hoặc sản phẩm khác dùng thì giữ lại). Sản phẩm đã có trong đơn thì bị chặn — dùng **Ẩn sản phẩm** để giữ lịch sử đơn. Đơn hàng và lịch sử nhập CSV/ZIP không bị ảnh hưởng; lần nhập CSV sau có thể tạo lại sản phẩm đã xoá. Chưa có xoá hàng loạt hay thùng rác.
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

### Trang chủ (`/admin/trang-chu`)

- Chọn thủ công sản phẩm cho **Giảm giá sốc** (hiện tối đa 4) và **Sản phẩm nổi bật** (hiện tối đa 8): tìm theo tên/thương hiệu/slug/SKU → **Thêm**; nút ↑ ↓ đổi thứ tự; **Bỏ**. Mỗi khu chọn tối đa 12, không trùng; mỗi thay đổi lưu ngay (máy chủ kiểm tra quyền, mã sản phẩm, giới hạn). Lưu ở `site_settings` (khoá `home_picks`), không cần migration.
- Cửa hàng hiện các mục **hợp lệ đầu tiên** theo thứ tự đã lưu; khu không có mục hợp lệ (hoặc chưa chọn) bị **ẩn**. Không tự bổ sung từ nhãn mẫu hay số “đã bán”.
- Không hợp lệ (vẫn giữ trong danh sách, ghi lý do; hợp lệ lại thì tự hiện): sản phẩm Ẩn, danh mục Ẩn, hết hàng, không có phiên bản đang bán, đã xoá (bỏ qua an toàn).
- Thẻ ở hai khu dùng **phiên bản còn hàng có giá thấp nhất**; Giảm giá sốc chỉ nhận khi chính phiên bản đó có giá niêm yết > giá bán (mức giảm tính theo phiên bản đó). Chỉ **thêm** được sản phẩm đang đạt đúng điều kiện hiển thị đó (Hiện, danh mục Hiện, còn hàng, có giảm giá ở phiên bản hiển thị); máy chủ báo lý do nếu chưa đạt. Mục đã có mà tạm không đạt vẫn được giữ.
- Không đổi giá, kho, SKU, slug, nội dung hay số “đã bán”. (Lưu ý: sắp xếp “Phổ biến” ở trang danh mục/tìm kiếm vẫn dựa trên số “đã bán”, kể cả số của dữ liệu mẫu — `src/lib/listing.ts`.)

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

Cửa hàng không hiển thị điểm đánh giá và số đã bán (chưa có hệ thống đánh giá thật).

| Trang | Đường dẫn |
|---|---|
| Trang chủ | `/` |
| Danh mục (lọc giá, thương hiệu, sắp xếp, phân trang) | `/danh-muc/[slug]` |
| Chi tiết sản phẩm (ảnh, biến thể, tồn kho, thêm vào giỏ) | `/san-pham/[slug]` |
| Tìm kiếm không dấu (tên, thương hiệu, danh mục, SKU) | `/tim-kiem?q=...` |
| Giỏ hàng | `/gio-hang` |
| Thanh toán (COD, miễn phí giao hàng toàn quốc) | `/thanh-toan` |
| Đơn hàng của khách (chỉ xem được trên trình duyệt đã đặt) | `/don-hang/[mã đơn]` |
| Giới thiệu, Liên hệ, Hướng dẫn mua hàng | `/gioi-thieu`, `/lien-he`, `/huong-dan-mua-hang` |
| Chính sách: giao hàng, thanh toán, bảo hành, bảo mật, điều kiện mua hàng | `/chinh-sach/...` |
| Tin tức | `/tin-tuc`, `/tin-tuc/[slug]` |

### Cài đặt website, Trang nội dung, Tin tức (sửa trong quản trị)

Lưu trong CSDL (migration v6: bảng `site_settings`, `content_pages`, `news_posts`). Sửa xong website cập nhật ngay, không cần build lại.

- **Quản trị → Cài đặt** (`/admin/cai-dat`): tên thương hiệu, đơn vị vận hành, hotline, Zalo (số hoặc link https://zalo.me/…), email, địa chỉ, giờ hỗ trợ (để trống = không hiện), mô tả chân trang. Dùng ở header, chân trang, nút Hỗ trợ, trang Liên hệ, tiêu đề trang.
- **Quản trị → Nội dung** (`/admin/noi-dung`): 9 trang cố định — Giới thiệu, Liên hệ, Hướng dẫn mua hàng, Giao hàng, Thanh toán, Bảo hành, Đổi trả – hoàn tiền, Bảo mật, Điều kiện mua hàng.
  - **Lưu nháp**: trang đang công khai thì khách vẫn thấy bản cũ cho tới khi bấm **Công khai**. **Bỏ bản nháp** quay về bản đang công khai. **Chuyển về Nháp** ẩn trang và liên kết của nó ở menu/chân trang.
  - Trình soạn thảo: `## Tiêu đề`, `- danh sách`, `1. danh sách số`, `**đậm**`, `[chữ](liên kết)`, có nút chèn nhanh và **Xem trước**. Không nhận HTML (mọi ký tự hiện như chữ); liên kết chỉ nhận https/http, đường dẫn trong website, `tel:`, `mailto:`. Liên kết tới trang đang Nháp hiện như chữ thường.
  - Biến lấy từ Cài đặt: `{thuong_hieu}`, `{don_vi}`, `{hotline}`, `{hotline_link}`, `{zalo_link}`, `{email}`, `{email_link}`, `{dia_chi}`, `{gio_ho_tro}`.
  - Nội dung mặc định (`src/lib/content/defaults.ts`) chỉ được chèn khi CSDL **chưa có** trang đó; khởi động lại không ghi đè chỉnh sửa. Trang Đổi trả – hoàn tiền (nội dung đã duyệt) khởi tạo ở trạng thái **Nháp**.
  - **Chính sách bảo mật** mô tả đúng dữ liệu hệ thống đang thu thập; đổi cách thu thập/lưu dữ liệu thì phải sửa trang này.
- **Quản trị → Tin tức** (`/admin/tin-tuc`): thêm/sửa bài (tiêu đề, slug, mô tả ngắn, nội dung, ảnh đại diện tùy chọn), Lưu nháp / Công khai / Ẩn bài. Ảnh đại diện dùng chung quy trình tải ảnh sản phẩm (kiểm tra, xoá EXIF/GPS, WebP, `/anh/…`) và được `npm run backup` sao lưu cùng thư mục ảnh.
- **Không sửa được trong quản trị:** phí giao hàng (miễn phí toàn quốc) và phương thức thanh toán (COD) — gắn với logic tính tiền/lưu đơn trong `src/config/site.ts` và `src/lib/server/pricing.ts`. Đổi chữ trong trang nội dung không thay đổi phí, kho hay chế độ đơn thử nghiệm.
- Nút **Hỗ trợ** nổi (Gọi / Zalo / Email) tự nằm trên các thanh mua hàng cố định ở cuối màn hình (phần tử có `data-bottom-bar`) và tự ẩn khi tới footer.

## SEO

- **URL chuẩn:** `https://sura.vn` (đặt trong `src/lib/seo-text.ts`; đổi bằng biến `NEXT_PUBLIC_SITE_URL` lúc build nếu cần). Mỗi trang công khai có canonical tuyệt đối, Open Graph (ảnh: ảnh đại diện sản phẩm / ảnh bìa tin; chưa có ảnh chia sẻ mặc định thì bỏ trống).
- **Tiêu đề/mô tả:** sản phẩm, danh mục, tin tức, trang nội dung có 2 ô **SEO (tuỳ chọn)** trong quản trị (kèm bản xem trước mô phỏng, đếm ký tự để tham khảo, không chặn lưu). Để trống = mặc định: “Tên | Sura” (không lặp nếu tên đã có “Sura”), mô tả ngắn / đoạn văn đầu (đã bỏ mã định dạng). Giá trị riêng dùng nguyên văn. Trang nội dung và tin tức đang công khai: SEO lưu cùng bản nháp, chỉ áp dụng khi bấm **Công khai**.
- **Slug bị khoá** khi sản phẩm/danh mục từng Hiện hoặc bài tin từng công khai (kể cả sau khi Ẩn), vì chưa có quản lý chuyển hướng. Cần đổi thì phải làm chuyển hướng 301 trước (chưa có chức năng này).
- **Lập chỉ mục:** `/robots.txt` cho phép tất cả và trỏ tới `/sitemap.xml`. `noindex` cho quản trị, thanh toán, đơn hàng, giỏ hàng, tìm kiếm, danh mục chưa có sản phẩm, trang tin tức khi chưa có bài.
- **Danh mục:** phân trang `?trang=N` tự canonical (không gộp về trang 1). Có `sap-xep`, `gia` hoặc `thuong-hieu` → `noindex, follow`, không canonical. Giá trị lạ, tham số lặp, thương hiệu không có trong danh mục, số trang vượt → trang “không tìm thấy”. Tham số khác (vd. `utm_…`) bỏ qua, canonical vẫn là URL sạch.
- **Sitemap** (đọc CSDL mỗi lần gọi): trang chủ, danh mục đang hiện có sản phẩm, sản phẩm đang hiện (kể cả hết hàng), tin tức và trang nội dung công khai. `lastmod` = lần cuối bản công khai thay đổi (`public_updated_at`): đổi khi sửa nội dung/SEO/ảnh/giá công khai, khi Hiện/Ẩn, khi phiên bản chuyển còn ↔ hết hàng; **không** đổi khi lưu nháp, đổi số tồn mà vẫn còn hàng, hay khởi động lại. Dữ liệu có từ trước bản này chưa có ngày (không có căn cứ) nên chưa ghi `lastmod` cho tới lần sửa công khai kế tiếp.
- **Dữ liệu có cấu trúc:** trang chủ `OnlineStore` (tên, đơn vị, email, hotline, địa chỉ từ Cài đặt website; chưa có logo). `BreadcrumbList` ở sản phẩm, danh mục, tin tức. `Product` + `Offer` (giá VND, còn/hết hàng, SKU, thương hiệu, ảnh) **chỉ cho sản phẩm không có phiên bản**. `Article` cho tin tức (ngày đăng; ngày sửa nếu có; nhà xuất bản là cửa hàng; không khai tác giả). Không khai đánh giá, GTIN, thời gian giao, chính sách đổi trả.
- **Giới hạn đã biết:**
  - Sản phẩm có phiên bản chưa có `Product`/`ProductGroup`: Google yêu cầu mỗi biến thể có URL chọn sẵn riêng, website chưa có.
  - **Soft 404 (chưa sửa):** trang không tồn tại/ẩn/nháp ở `/san-pham`, `/danh-muc`, `/tin-tuc`, trang nội dung — và ở danh mục: trang vượt số trang, tham số được hỗ trợ nhưng sai giá trị (`trang`, `sap-xep`, `gia`, `thuong-hieu`) — vẫn trả HTTP 200 + `noindex`. Nguyên nhân: khung layout cửa hàng được dựng sẵn và gửi trước khi trang kiểm tra dữ liệu (đã thử đưa kiểm tra lên trước Suspense + `instant = false` trên bản production: vẫn 200). Muốn 404 thật cần `proxy.ts` hoặc đổi layout cửa hàng — chưa làm. Đường dẫn lạ khác trả 404 đúng; tham số theo dõi (`utm_*`, `fbclid`, `gclid`…) không bị coi là lỗi.
  - Chuyển hướng `http://` và `www.` về `https://sura.vn` làm ở cPanel (xem mục triển khai), không làm trong mã.

### Sau khi triển khai bản SEO (trên hosting)

1. **HTTPS/www:** cPanel → **Domains** → bật **Force HTTPS Redirect** cho `sura.vn`. Chuyển `www` về tên miền chính: cPanel → **Redirects** → loại **Permanent (301)**, tên miền `sura.vn`, chọn **Only redirect with www.**, chuyển tới `https://sura.vn/`, đánh dấu **Wild Card Redirect** (giữ nguyên đường dẫn). Giao diện iNET khác thì nhờ iNET cấu hình đúng ý này. Sau đó kiểm tra từng dòng, mỗi URL phải **chuyển đúng 1 lần** tới `https://sura.vn/…` và trang cuối trả 200 (nếu thấy chuyển qua lại nhiều lần = vòng lặp HTTPS: tắt ngay rồi hỏi iNET):
   `curl -sI http://sura.vn/` · `curl -sI http://www.sura.vn/` · `curl -sI https://www.sura.vn/gioi-thieu` · `curl -sIL http://www.sura.vn/ | grep -i "^location|^HTTP"`
2. Mở `https://sura.vn/robots.txt` và `https://sura.vn/sitemap.xml` (phải là nội dung, không phải trang 404); URL trong sitemap đều bắt đầu bằng `https://sura.vn/`.
3. Xem nguồn trang (Ctrl+U) một sản phẩm, một danh mục, một tin: có `<link rel="canonical" href="https://sura.vn/…">`, `og:title`, và `application/ld+json`.
4. **Google Search Console:** thêm tài sản loại **Miền** `sura.vn`, xác minh bằng bản ghi TXT ở DNS của iNET (không cần sửa mã). Gửi sitemap `https://sura.vn/sitemap.xml`. Dùng **Kiểm tra URL** cho trang chủ, 1 sản phẩm, 1 danh mục, 1 tin → “Kiểm tra URL đang hoạt động” → xem ảnh chụp và HTML đã kết xuất.
5. **Rich Results Test** (search.google.com/test/rich-results) cho 1 sản phẩm không có phiên bản và 1 tin tức.

## Chatbot tư vấn khách hàng

Nút **“Trợ lý Sura”** nằm trong cụm hỗ trợ góc phải. Trợ lý trò chuyện linh hoạt như một trợ lý AI thông thường (kiến thức chung, giải thích, phân tích, tính toán, so sánh) và tư vấn hàng Sura. Khi hỏi về sản phẩm, giá, tồn kho, chính sách của Sura, trợ lý **bắt buộc tra dữ liệu thật** bằng công cụ chỉ đọc; chỉ thấy sản phẩm/danh mục **đang Hiện**. Thẻ sản phẩm (giá, phiên bản, còn/hết hàng, liên kết) luôn do máy chủ lấy lại từ CSDL. Chưa tìm web: với giá thị trường, tin tức, thông tin mới, trợ lý nói rõ là chưa kiểm tra được. Câu trả lời hiển thị dạng chữ thuần (không chạy HTML); số liệu và giá được giữ nguyên; chỉ đường link `http(s)` hợp lệ mới bấm được (mở tab mới, `rel="noopener noreferrer nofollow"`).

**Mặc định Tắt.** Chatbot chỉ chạy khi có đủ hai điều kiện: công tắc ở **Quản trị → Cài đặt website → Chatbot tư vấn** đang Bật, và máy chủ có khoá API. Thiếu một trong hai thì nút không hiện và website không gọi API.

### Biến môi trường (cPanel → Setup Node.js App → Environment variables)

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `OPENAI_API_KEY` | có | — | Khoá API OpenAI. **Chỉ đặt ở đây**, không ghi vào mã, Git, ZIP hay chat. |
| `CHAT_MODEL` | không | `gpt-6-luna` | Model dùng cho Responses API. |
| `CHAT_DAILY_BUDGET_USD` | không | `1` | Ngân sách mỗi ngày (giờ Việt Nam). Hết ngân sách thì chatbot dừng và hiện nút Zalo. |
| `CHAT_PRICE_INPUT_PER_M`, `CHAT_PRICE_CACHED_INPUT_PER_M`, `CHAT_PRICE_OUTPUT_PER_M` | không | `0.1`, `0.01`, `0.5` | Giá USD / 1 triệu token, dùng để tính chi phí. Đổi model thì cập nhật theo bảng giá chính thức. |
| `CHAT_MAX_CONCURRENT` | không | `3` | Số câu hỏi được xử lý cùng lúc trên toàn website. |
| `CHAT_HMAC_SECRET` | không | tự tạo, lưu trong CSDL | Khoá bí mật để băm IP và phiên. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | không | — | Cloudflare Turnstile (miễn phí) cho CAPTCHA. Không có thì khi khách hỏi dồn dập, hệ thống tạm chặn vài phút thay cho CAPTCHA. |

| `CHAT_ALLOW_NO_IP_TEST` | không | (tắt) | Đặt `1` để **thử công khai khi hosting chưa có nguồn IP tin cậy**: chatbot trả lời dù thiếu IP, nhưng không tin header IP nào (kể cả `!~Passenger-Client-Address`), nên không có giới hạn theo IP. Bù lại có **trần tổng 0,10 USD cộng dồn** mọi ngày cho toàn website, không đặt lại khi Restart hay sang ngày mới. Vẫn giữ giới hạn phiên, chống gửi trùng, giới hạn đồng thời và 20 giây/lượt. |

Sau khi đặt hoặc đổi biến, bấm **Restart** ứng dụng.

**Thử công khai không cần IP:** đặt `OPENAI_API_KEY` và `CHAT_ALLOW_NO_IP_TEST=1` → Restart → Cài đặt → **Bật chatbot**. Trang Cài đặt hiện “Chế độ thử… ĐANG BẬT” và tổng chi phí từ trước tới nay / 0,1 USD. Đạt trần thì chatbot dừng hẳn và chuyển khách sang Zalo. Kết thúc thử: bấm **Tắt chatbot** (chặn ngay mọi lần gọi AI, kể cả câu đang xử lý dở), rồi xoá `CHAT_ALLOW_NO_IP_TEST` (và khoá nếu không dùng nữa) → Restart.

### Giới hạn và chống spam

- **Mỗi phiên:** 5 câu/phút, 30 câu/ngày, mỗi lần 1 câu. Gửi trùng hoặc gửi khi câu trước chưa xong đều bị chặn.
- **Mỗi IP:** 20 câu/phút, 150 câu/ngày, tối đa 10 phiên mới/giờ. Ngưỡng này nới rộng để không chặn nhầm Wi-Fi dùng chung.
- **IP tin cậy (biến `SURA_IP_SOURCE`):**
  - `inet-oneshield` — **dùng cho hosting iNET** (LiteSpeed + proxy OneShield). Chỉ tin `X-Real-IP`: OneShield thay thế header này bằng IP thật của kết nối (đã kiểm chứng: Wi-Fi/5G khác nhau, header giả mạo không đổi được kết quả). Chuẩn hoá `::ffff:a.b.c.d`, kiểm tra IP hợp lệ, loại loopback. **Không** dùng header Passenger, địa chỉ socket (luôn `127.0.0.1` dưới LiteSpeed) hay `X-Forwarded-For` (phần tử cuối là IP proxy `103.57.*.*`, giống nhau cho mọi khách).
  - Không đặt: cách cũ — header bảo mật `!~Passenger-Client-Address` (Passenger thật) hoặc địa chỉ socket khi kết nối thẳng.
  - Giá trị khác: không tin nguồn nào.
  - Header nội bộ `x-sura-client-ip`/`x-sura-ip-source` do khách gửi luôn bị xoá trước khi `app.js` tự gắn IP. Không xác định được IP thì chatbot **không gọi AI** (trừ chế độ thử `CHAT_ALLOW_NO_IP_TEST=1`, vốn không dùng IP để giới hạn lượt): khách chỉ xem được trả lời nhanh chính sách và được chuyển sang Zalo.
- **Hỏi dồn hoặc lặp:** hỏi từ 4 câu/phút, lặp cùng một câu 3 lần, hoặc IP gửi quá 10 câu/phút thì phải qua CAPTCHA trước khi gọi AI. Qua rồi thì không hỏi lại trong 30 phút.
- **Độ dài:** mỗi câu tối đa 800 ký tự. Lịch sử gửi kèm tối đa 12 tin và 8.000 ký tự (mỗi câu trả lời cũ tối đa 4.000 ký tự); giao diện và máy chủ dùng chung một quy tắc (`src/lib/chat-limits.ts`), máy chủ vẫn tự cắt lại.
- **Mỗi lượt hỏi:** tối đa 3 vòng gọi công cụ, 1.000 token đầu ra mỗi lần gọi và 2.500 token đầu ra cho cả lượt (40.000 token đầu vào; luôn chừa một lần gọi để trả lời bằng dữ liệu đã có); phần giữ trước ngân sách tính theo đúng các trần này; quá 20 giây thì huỷ.
- **Ngân sách:** máy chủ giữ trước chi phí ước tính trước mỗi lần gọi, kể cả vòng gọi công cụ, rồi đối soát theo `usage` thật. Lần gọi nào không nhận được `usage` (quá hạn, lỗi) thì tính đủ phần đã giữ trước.
- Lượt bị chặn không gọi OpenAI. Câu hỏi nhanh về giao hàng, đổi trả, bảo hành và thanh toán lấy thẳng từ trang chính sách, không dùng AI.

### Tìm web (giai đoạn B) — mặc định Tắt

- Công tắc riêng **Bật/Tắt tìm web** trong Cài đặt website (độc lập với công tắc chatbot). Dùng công cụ `web_search` của OpenAI (`search_context_size: low`, vị trí Việt Nam).
- Chỉ tìm khi cần thông tin cập nhật hoặc khách yêu cầu đối chiếu thị trường. Giá/kho/chính sách Sura luôn tra hệ thống. Nguồn hiển thị lấy từ kết quả tìm (bấm được, mở tab mới); liên kết model tự viết không có trong kết quả tìm thì không bấm được.
- Giới hạn: tối đa **2 lần tìm/câu hỏi**, **6 lần/phiên/ngày**, **20 lần/ngày** cho toàn website (`CHAT_WEB_SEARCHES_PER_DAY`). Lượt tìm được giữ trước, phần không dùng được trả lại.
- Phí: **0,01 USD/lần tìm** + token nội dung tìm được (giá model). Mỗi lần gọi có tìm web giữ trước phí tối đa; đối soát theo số lần tìm thực tế. Không đủ ngân sách cho phí tìm → trả lời không tìm web.
- Thời gian: lượt có thể tìm web tối đa **45 giây** (lượt thường 20 giây); giao diện chờ tối đa 60 giây, có trạng thái chờ và nút **Huỷ**. Khách huỷ/đóng trang → máy chủ dừng gọi OpenAI và mở khoá ngay.

### Lỗi “không kết nối” sau khoảng nghỉ

- Giao diện phân biệt: mất mạng, không gửi được tới máy chủ, máy chủ trả trang lỗi (ghi kèm mã HTTP, vd. 503 khi ứng dụng đang khởi động lại), quá 60 giây, hết giới hạn. Câu hỏi thất bại được giữ lại với nút **Thử lại** (không tự gửi lại).
- Log máy chủ ghi `[chat] mô-đun chatbot sẵn sàng; tiến trình đã chạy … giây` mỗi khi tiến trình Node vừa khởi động phục vụ câu hỏi đầu tiên. Nếu dòng này xuất hiện sau mỗi khoảng nghỉ, hosting đang dừng ứng dụng khi nhàn rỗi (Passenger mặc định 300 giây).

### Quyền riêng tư

- Gọi API với `store: false`. Máy chủ website **không lưu nội dung hội thoại**. Lịch sử chỉ lưu trong `localStorage` của trình duyệt khách (tối đa 40 tin, khoảng 150 KB, tự xoá sau 7 ngày); nút **Cuộc trò chuyện mới** xoá ngay. Không lưu khoá hay dữ liệu bí mật.
- Khi bật tìm web, nội dung câu hỏi có thể được OpenAI dùng làm truy vấn tìm kiếm.
- Bảng `chat_budget_daily` chỉ chứa số liệu: chi phí, số câu, số lỗi. Bảng `chat_rate` và `chat_inflight` chỉ lưu mã băm HMAC của phiên và IP, không lưu IP gốc, và tự dọn khi hết hạn.
- Nhật ký máy chủ chỉ ghi mã lỗi HTTP, không ghi câu hỏi, khoá hay IP.
- Công cụ AI dùng chỉ **đọc** dữ liệu công khai, gồm sản phẩm và danh mục đang Hiện cùng trang chính sách đã công khai. AI không truy cập được đơn hàng, khách hàng, giá nhập, và không thể ghi gì vào CSDL.

### Sau khi triển khai lên hosting

1. Đặt `OPENAI_API_KEY` (và nếu muốn, Turnstile) trong cPanel, rồi Restart.
2. Mở **Quản trị → Cài đặt website**. Mục “IP hệ thống nhận diện cho bạn” phải hiện IP đã che bớt, với nguồn “header bảo mật của Passenger”. So nó với IP thật của bạn (tra “what is my ip”). Nếu hiện “không xác định”, chatbot sẽ không gọi AI; hãy báo lại để kiểm tra phiên bản Passenger (cần ≥ 5.0.21).
3. Bấm **Bật chatbot**, thử vài câu, rồi xem chi phí trong ngày ở cùng mục.

### Tắt hoặc khôi phục

- Tắt ngay: bấm **Tắt chatbot** trong Cài đặt, hoặc xoá `OPENAI_API_KEY` rồi Restart.
- Quay về bản trước: triển khai lại ZIP cũ. Migration v10 chỉ **thêm** 3 bảng thống kê và giới hạn lượt, không đụng dữ liệu kinh doanh, nên bản cũ vẫn chạy được với CSDL đã nâng lên v10.

## Cấu trúc

```
app.js                 Tệp khởi động cho hosting cPanel (Passenger)
postcss.config.mjs     Tailwind CSS qua PostCSS
public/mau/            File CSV mẫu để nhập hàng
scripts/
  admin-setup.mts      Lệnh `npm run admin:setup`
  catalog-import.mts   Lệnh `npm run catalog:import`
  backup.mts           Lệnh `npm run backup`
src/
  app/
    (shop)/            Các trang cửa hàng
    admin/
      dang-nhap/       Đăng nhập quản trị
      (bao-ve)/        Trang cần đăng nhập: đơn hàng, sản phẩm, danh mục
      actions.ts       Đăng nhập/đăng xuất, trạng thái đơn, ghi chú
      catalog-actions.ts  Danh mục, sản phẩm, tải ảnh
      import-actions.ts   Nhập CSV: xem trước, xác nhận
    anh/[file]/        Phục vụ ảnh sản phẩm đã tải lên
  components/          Giao diện dùng chung (layout, product, listing, ui, admin)
  config/site.ts       Hằng số gắn với đơn hàng: phí giao hàng, phương thức thanh toán
  lib/content/         Cài đặt mặc định, danh sách trang nội dung, định dạng nội dung, nội dung khởi tạo
  lib/server/site-content.ts  Đọc/ghi cài đặt, trang nội dung, tin tức
  data/                Dữ liệu mẫu (nguồn cho bước nhập)
  lib/data/catalog.ts  Đọc danh mục/sản phẩm cho cửa hàng (từ CSDL)
  lib/import/          Đọc CSV, định nghĩa cột nhập hàng
  lib/server/import/   Lập kế hoạch nhập, ghi dữ liệu, tải ảnh từ URL an toàn
  lib/server/          Chỉ chạy trên server: db, schema (migration), catalog-seed, orders, pricing,
                       images, admin-auth, admin-orders, admin-catalog, password
  store/cart.ts        Giỏ hàng (zustand + localStorage)
```

## Chưa có (giai đoạn sau)

Form liên hệ, chức năng quản lý yêu cầu đổi trả, hệ thống đánh giá sản phẩm, thanh toán online, nhiều tài khoản/phân quyền, xác thực hai lớp, xoá hàng loạt / thùng rác, sửa thông số kỹ thuật trong quản trị, xem/sửa giá nhập trong quản trị, xuất sản phẩm ra CSV, tự thu thập dữ liệu nguồn hàng, dọn ảnh không còn dùng, gửi email/SMS, giới hạn tần suất đặt đơn, báo cáo. Khi lên máy chủ ổn định: giới hạn đăng nhập theo IP thật (sau proxy), sao lưu tự động định kỳ.
