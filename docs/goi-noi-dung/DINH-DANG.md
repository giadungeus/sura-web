# Định dạng gói nội dung Sura — phiên bản 1

> Khớp với chức năng **Quản trị → Nhập gói** đã triển khai. Website kiểm tra đúng các quy tắc dưới đây.
>
> Cập nhật 13/11/2026: sản phẩm nhận thêm `video_san_pham` (mục 2.2.1). Vẫn là **phiên bản 1** — gói cũ không có khoá này nhập như trước.

Tài liệu cho người soạn gói (Mimi). Một gói là **một tệp ZIP** chứa bài viết và ảnh. Quản trị tải gói lên
**Quản trị → Nhập gói nội dung**, xem trước, chọn **Lưu nháp** (mặc định) hoặc **Công khai**, rồi xác nhận.

> Gói mẫu: `goi-mau-sura.zip` (thư mục nguồn: `mau/`). Gói mẫu chỉ để tham khảo cách soạn — **không nhập lên website thật**.

---

## 1. Cấu trúc ZIP

```
goi.json              ← bắt buộc, nằm ngay gốc ZIP (không bọc trong thư mục con)
bai/                  ← các bài viết, mỗi bài một tệp .md (UTF-8)
  cap-anker-a81b6.md
  tin-cach-chon-cap.md
anh/                  ← ảnh dùng trong gói
  a81b6-dai-dien.jpg
  bang-cong-suat.png
```

- Tên tệp và thư mục: **chữ thường không dấu, số, `-`, `_`, `.`**; không dấu cách. Ví dụ `cap-anker-01.jpg`.
- Chỉ nhận: `goi.json`, `.md`, `.jpg` / `.jpeg` / `.png` / `.webp`. Tệp khác bị từ chối (riêng `__MACOSX/`, `.DS_Store`, `Thumbs.db` được bỏ qua).
- Ảnh hoặc bài có trong ZIP mà không được dùng → cảnh báo (không chặn).

## 2. Tệp `goi.json`

```json
{
  "dinh_dang": "sura-goi-noi-dung",
  "phien_ban": 1,
  "ten_goi": "Bài cáp sạc Anker và tin tháng 11",
  "nguoi_soan": "Mimi",
  "ngay_soan": "2026-11-01",
  "muc": [ … các mục nội dung … ]
}
```

| Khoá | Bắt buộc | Ghi chú |
|---|---|---|
| `dinh_dang` | Có | Luôn là `"sura-goi-noi-dung"` |
| `phien_ban` | Có | Luôn là `1` |
| `ten_goi`, `nguoi_soan`, `ngay_soan` | Không | Hiện ở màn hình xem trước, lưu kèm lịch sử nhập. `nguoi_soan` **không** hiện trên website và **không** được dùng làm tác giả bài viết |
| `muc` | Có | Danh sách 1–30 mục |

### 2.1 Các khoá chung của một mục

| Khoá | Dùng cho | Ghi chú |
|---|---|---|
| `loai` | tất cả | `"san_pham"`, `"tin_tuc"`, `"trang"` hoặc `"danh_muc"` |
| `tieu_de` | sản phẩm, tin tức, trang | Tối đa 150 ký tự. Với sản phẩm: **không bắt buộc** (bỏ trống = giữ tên hiện có). Danh mục không đổi tên qua gói |
| `mo_ta_ngan` | sản phẩm, tin tức | Tối đa 300 ký tự |
| `bai_viet` | tất cả | Đường dẫn tới tệp `.md` trong ZIP, ví dụ `"bai/cap-anker-a81b6.md"`. Với danh mục: **không bắt buộc** (xem mục 2.6) |
| `anh_dai_dien` | sản phẩm, tin tức | `{ "tep": "anh/….jpg", "alt": "mô tả ảnh" }` — `alt` bắt buộc |
| `seo_title` | tất cả | Không bắt buộc. Tiêu đề hiện trên Google/thẻ chia sẻ — xem mục 2.5 |
| `seo_description` | tất cả | Không bắt buộc. Mô tả hiện trên Google/thẻ chia sẻ — xem mục 2.5 |

### 2.2 Bài sản phẩm — `"loai": "san_pham"`

Gói **chỉ viết bài cho sản phẩm đã có** (tạo bằng nhập CSV hoặc trong quản trị). Gói không tạo sản phẩm mới
và **không bao giờ đổi giá, tồn kho, SKU, phiên bản hay danh mục**.

Nhận diện sản phẩm theo **một** trong hai cách:

```json
{ "loai": "san_pham", "nguon": "techmall", "ma_san_pham": "A81B6H11", … }
{ "loai": "san_pham", "slug": "cap-sac-nhanh-anker-322", … }
```

| Khoá riêng | Ghi chú |
|---|---|
| `nguon` + `ma_san_pham` | Giống cột `nguon`, `ma_san_pham` của file CSV |
| `slug` | Đường dẫn sản phẩm hiện có (`/san-pham/<slug>`) |
| `anh_san_pham` | Ảnh thêm vào bộ ảnh sản phẩm: `[{ "tep": "anh/….jpg", "alt": "…" }]`. Tổng ảnh của sản phẩm tối đa 10 |
| `video_san_pham` | Không bắt buộc. Video YouTube/TikTok thêm vào hàng **Video sản phẩm** — xem mục 2.2.1 |

`anh_dai_dien` của sản phẩm trở thành ảnh đại diện; `bai_viet` thay phần **Mô tả sản phẩm** (tối đa 20.000 ký tự); `mo_ta_ngan` thay mô tả ngắn; `tieu_de` (nếu có) thay tên sản phẩm.

> Trang sản phẩm **không còn khối “Điểm nổi bật”** riêng. Muốn nêu điểm nổi bật, viết thành một phần trong `bai_viet` (vd. `## Điểm nổi bật` kèm danh sách).

#### 2.2.1 Video sản phẩm — `video_san_pham`

```json
"video_san_pham": [
  { "tieu_de": "Hướng dẫn kết nối", "url": "https://www.youtube.com/watch?v=aqz-KE-bpKQ", "anh_bia": "anh/video-ket-noi.jpg" },
  { "tieu_de": "Trải nghiệm thực tế", "url": "https://www.youtube.com/shorts/xxxxxxxxxxx" },
  { "tieu_de": "Mở hộp", "url": "https://www.tiktok.com/@ten-tai-khoan/video/7300000000000000000" }
]
```

| Khoá | Bắt buộc | Ghi chú |
|---|---|---|
| `tieu_de` | Có | 2–100 ký tự, hiện dưới ảnh bìa video (tối đa 2 dòng) |
| `url` | Có | **Chỉ link**, không dán mã nhúng/iframe. Nhận: YouTube (`watch?v=`, `youtu.be/`, `/shorts/`, `/embed/`, `/live/`) và TikTok dạng đầy đủ `tiktok.com/@tài-khoản/video/<mã>`. Link TikTok rút gọn (`vt.`/`vm.tiktok.com`) **không** nhận trong gói |
| `anh_bia` | Không | Đường dẫn ảnh trong `anh/` của ZIP (JPEG/PNG/WebP), không cần `alt`. Bỏ trống → video YouTube dùng ảnh khung hình của YouTube; video TikTok hiện thẻ có nút phát (có thể lấy/tải ảnh bìa sau trong trang sửa sản phẩm) |

- **Thứ tự**: đúng thứ tự trong mảng, **nối vào sau** các video sản phẩm đang có. Video đang có giữ nguyên (không xoá, không đổi tiêu đề/thứ tự).
- **Trùng**: so theo nền tảng + mã video đã chuẩn hoá (vd. `youtu.be/ID`, `watch?v=ID` là cùng một video). Video đã có trên sản phẩm → **bỏ qua**; nhập lại cùng gói không tạo video trùng. Hai video trùng nhau trong cùng một mục → lỗi.
- **Không có khoá `video_san_pham`** → giữ nguyên video hiện có (gói cũ vẫn dùng được, `phien_ban` vẫn là `1`). Mảng rỗng `[]` cũng không xoá gì — muốn xoá video, dùng trang sửa sản phẩm.
- Tổng video của một sản phẩm tối đa **10** (kể cả video đã có).
- Lỗi được báo **theo từng video**, ví dụ: `"video_san_pham" thứ 2: thiếu "tieu_de"`, `"url" — Chỉ hỗ trợ video YouTube hoặc TikTok`, `không tìm thấy ảnh bìa anh/… trong ZIP`.
- Video đi theo cùng lựa chọn với bài sản phẩm: **Lưu nháp** → video chỉ hiện khi **Áp dụng bản nháp**; **Công khai** → hiện ngay.

### 2.3 Tin tức — `"loai": "tin_tuc"`

| Khoá riêng | Ghi chú |
|---|---|
| `slug` | Bắt buộc. Chữ thường không dấu, số, `-`. Đã có bài cùng slug → **cập nhật** bài đó; chưa có → **tạo mới** |

### 2.4 Trang nội dung — `"loai": "trang"`

| `slug` hợp lệ | Trang |
|---|---|
| `gioi-thieu`, `lien-he`, `huong-dan-mua-hang` | Giới thiệu, Liên hệ, Hướng dẫn mua hàng |
| `giao-hang`, `thanh-toan`, `bao-hanh`, `doi-tra`, `bao-mat`, `dieu-kien-mua-hang` | Các trang chính sách |

Trang không có mô tả ngắn và ảnh đại diện (nếu ghi sẽ bị bỏ qua kèm cảnh báo). Ảnh trong bài vẫn dùng được.

> ⚠️ Chính sách (giao hàng, thanh toán, bảo hành, đổi trả, bảo mật) phải khớp cách website đang vận hành:
> hiện **miễn phí giao hàng toàn quốc** và **chỉ thanh toán khi nhận hàng (COD)**. Đổi chữ trong bài
> không làm thay đổi phí hay cách thanh toán.

### 2.5 SEO — `seo_title`, `seo_description` (quy ước riêng của Sura)

Hai khoá tuỳ chọn, dùng được cho cả ba loại mục. Chúng chỉ đổi **tiêu đề/mô tả cho Google và thẻ chia sẻ**,
không đổi tên hay nội dung hiển thị trên trang.

| Trong `goi.json` | Kết quả |
|---|---|
| **Không có khoá** | Giữ giá trị SEO đang lưu (gói cũ không có hai khoá này vẫn nhập bình thường) |
| Chuỗi có nội dung, vd. `"seo_title": "Cáp sạc nhanh Anker 322 USB-C"` | Đặt giá trị SEO riêng |
| Chuỗi rỗng hoặc chỉ khoảng trắng: `"seo_title": ""` | Xoá giá trị riêng, quay về **mặc định** |
| `null`, số, danh sách… (sai kiểu) | **Lỗi**, gói không xác nhận được cho tới khi sửa |

- **Mặc định** khi không có giá trị riêng: tiêu đề = tên/tiêu đề + ` | Sura` (không lặp nếu tên đã có “Sura”);
  mô tả = mô tả ngắn (trang nội dung: đoạn văn đầu tiên), đã bỏ mã định dạng.
- `seo_title` được dùng **nguyên văn** — website không tự thêm “| Sura”. Muốn có tên thương hiệu thì tự ghi.
- Không có giới hạn “60/160 ký tự”; Google tự cắt theo màn hình. Website chỉ chặn chuỗi quá dài để chống lỗi
  dữ liệu (tiêu đề 200, mô tả 500 ký tự). Viết ngắn gọn, đúng nội dung trang; không nhồi từ khoá.
- SEO đi cùng **bản nháp**: chọn **Lưu nháp** thì SEO mới nằm trong bản nháp, khách và Google vẫn thấy SEO cũ;
  khi **Công khai** (hoặc **Áp dụng bản nháp** sản phẩm) thì nội dung và SEO được áp dụng cùng lúc.
- Màn hình xem trước ghi rõ “Tiêu đề SEO”, “Mô tả SEO → mặc định”… và giá trị SEO sau khi nhập.
- Cần website **đã cập nhật bản có SEO** trên hosting; bản cũ bỏ qua hai khoá này mà không báo.

### 2.6 Danh mục — `"loai": "danh_muc"`

Viết **mô tả ngắn, nội dung chi tiết và SEO** cho danh mục **đã có** trên website (Hiện hay Ẩn đều được). Gói
**không tạo danh mục mới** và **không đổi** tên, slug, danh mục cha, thứ tự, biểu tượng, Hiện/Ẩn hay sản phẩm của danh mục.

```json
{
  "loai": "danh_muc",
  "slug": "loa-bluetooth",
  "mo_ta_ngan": "Loa Bluetooth chính hãng, giao miễn phí toàn quốc.",
  "bai_viet": "bai/danh-muc-loa-bluetooth.md",
  "seo_title": "Loa Bluetooth chính hãng | Sura",
  "seo_description": "Chọn loa Bluetooth theo công suất, thời lượng pin và chuẩn chống nước."
}
```

| Khoá | Bắt buộc | Ghi chú |
|---|---|---|
| `slug` | Có | Slug danh mục đã có (`/danh-muc/<slug>`). Không có → lỗi |
| `mo_ta_ngan` | Không | Hiện dưới tên danh mục; tối đa 300 ký tự |
| `bai_viet` | Không | Nội dung chi tiết: hiện **dưới danh sách sản phẩm và phân trang**, chỉ ở trang đầu (không lọc/sắp xếp). Viết như mục 3 (H2/H3, danh sách, bảng, liên kết, ảnh có alt; **không** dùng `#`) |
| `seo_title`, `seo_description` | Không | Như mục 2.5 |
| `tieu_de`, `anh_dai_dien`, `anh_san_pham` | — | Bị bỏ qua kèm cảnh báo |

**Quy tắc từng trường (riêng của Sura):**

| Trong gói | Kết quả |
|---|---|
| **Không có khoá** | Giữ nguyên giá trị đang lưu (xem bảng Lưu nháp/Công khai dưới đây) |
| Chuỗi có nội dung | Cập nhật. Với `bai_viet`: đường dẫn tệp `.md` trong `bai/` |
| `""` (chuỗi rỗng) | Xoá: `mo_ta_ngan` rỗng; `bai_viet` rỗng = **xoá nội dung chi tiết**; `seo_*` về mặc định |
| `null`, số, danh sách… | **Lỗi**, gói bị từ chối khi tải lên |

**Lưu nháp / Công khai với danh mục:**

| | Lưu nháp | Công khai |
|---|---|---|
| Trường **có** trong gói | Ghi vào bản nháp; khách vẫn thấy nội dung và SEO cũ | Áp dụng ngay cho khách (nội dung và SEO cùng lúc) |
| Trường **không có** trong gói | Giữ giá trị của **bản nháp đang có**; chưa có nháp thì lấy theo bản công khai | Giữ **bản công khai**. Những thay đổi khác đang nằm trong bản nháp cũ **không** bị công khai theo |
| Bản nháp cũ (nếu có) | Được cập nhật như trên | Vẫn giữ; các trường trong gói được cập nhật vào bản nháp để bản nháp không ghi đè ngược lại |
| Danh mục đang Ẩn | Vẫn Ẩn | Vẫn Ẩn (công khai nội dung **không** làm hiện danh mục) |

Sau khi nhập, vào **Quản trị → Danh mục → sửa → Nội dung & SEO** để xem, sửa tiếp, **Công khai** hoặc **Bỏ bản nháp**.

## 3. Cách viết bài (`.md`)

Không viết tiêu đề bài trong tệp — tiêu đề lấy từ `tieu_de`. Mọi ký tự hiển thị như chữ: **không dùng HTML**.

| Muốn có | Viết |
|---|---|
| Tiêu đề mục (H2) | `## Thông số kỹ thuật` |
| Tiêu đề nhỏ (H3) | `### Cổng kết nối` |
| Đoạn văn | Viết liền; **để một dòng trống** giữa hai đoạn |
| Xuống dòng trong đoạn | Xuống dòng bình thường |
| Chữ đậm | `**chữ đậm**` |
| Danh sách | `- mục` (mỗi mục một dòng) |
| Danh sách số | `1. mục`, `2. mục` |
| Liên kết | `[chữ hiển thị](https://…)`, `[Chính sách bảo hành](/chinh-sach/bao-hanh)`, `[gọi](tel:+84969605196)`, `[email](mailto:…)` |
| Ảnh xen kẽ | Một dòng riêng: `![văn bản thay thế](anh/ten-anh.jpg "Chú thích dưới ảnh")` — chú thích không bắt buộc, văn bản thay thế **bắt buộc** |
| Bảng | Xem dưới |
| Thông tin cửa hàng | `{hotline}`, `{email}`, `{dia_chi}`, `{thuong_hieu}`… (tự lấy từ Cài đặt website) |

Bảng (dòng thứ hai bắt buộc là dòng `---`):

```
| Thông số | Giá trị |
| --- | --- |
| Công suất | 30W |
| Chiều dài | 1,8 m |
```

Gợi ý đọc tốt trên điện thoại: đoạn văn ngắn (2–4 câu); bảng tối đa 4 cột; ảnh ngang tỉ lệ 4:3 hoặc 16:9.

**Không** dùng: `# ` (H1), HTML (`<b>`, `<img>`, `<table>`…), ảnh lấy từ đường dẫn web (chỉ ảnh trong ZIP), liên kết `javascript:`.

## 4. Ảnh

- Đầu vào: JPEG, PNG hoặc WebP; **tối đa 5 MB/ảnh** (ảnh lớn hơn 500 KB vẫn nhận — website tự tối ưu); cạnh ngắn ≥ 100 px; tối đa 40 triệu điểm ảnh; không dùng ảnh động. Tệp đổi đuôi nhưng không phải ảnh thật bị từ chối.
- Website tự xoay đúng chiều, **xoá thông tin vị trí (EXIF/GPS)**, thu nhỏ theo vị trí dùng (không phóng to ảnh nhỏ, không làm méo) và lưu **WebP**:

  | Vị trí | Cạnh dài tối đa | Dung lượng mục tiêu |
  |---|---|---|
  | Ảnh đại diện, ảnh sản phẩm, ảnh bìa tin tức | 1200 px | 50–150 KB |
  | Ảnh trong bài | 1400 px | 100–250 KB |
  | Ảnh nhiều chi tiết / chữ nhỏ | như trên | tối đa **500 KB** |

  Website giảm chất lượng từng bước nhưng không thấp hơn mức giữ chữ rõ. Ảnh vượt mục tiêu (≤ 500 KB) được nhận kèm ghi chú ở bước xem trước. Nếu vẫn > 500 KB, gói **báo đúng ảnh cần thay** — hãy cắt bớt vùng thừa hoặc dùng ảnh ít chi tiết hơn.
- Ảnh trong bài tải khi người xem cuộn gần tới; ảnh bìa tin tức và ảnh sản phẩm chính hiện ngay.
- Một ảnh dùng ở nhiều chỗ hoặc nhập lại nhiều lần chỉ lưu **một lần** (nhận diện theo nội dung tệp).
- Mọi ảnh cần `alt` — mô tả ngắn nội dung ảnh cho người dùng trình đọc màn hình (vd. “Cáp Anker 322 màu đen cuộn tròn”).

## 5. Giới hạn

| Mục | Giới hạn |
|---|---|
| Dung lượng ZIP | **10 MB** |
| Số tệp trong ZIP | 150 |
| Số mục trong `goi.json` | 30 |
| Một bài viết | 50.000 ký tự (bài sản phẩm 20.000) |
| `goi.json`, tệp `.md` | 512 KB/tệp, UTF-8 |
| Ảnh | 5 MB/ảnh đầu vào; tổng sau giải nén ≤ 40 MB |
| Ảnh sản phẩm | tổng tối đa 10 ảnh/sản phẩm (kể cả ảnh đã có) |
| Video sản phẩm | tổng tối đa 10 video/sản phẩm (kể cả video đã có) |

ZIP có mật khẩu, ZIP lồng nhau, liên kết tượng trưng, tên tệp có `..` hoặc ký tự lạ, tỉ lệ nén bất thường (“ZIP bomb”) đều bị từ chối.

## 6. Khi nhập

1. **Tải lên** → hệ thống kiểm tra ZIP, `goi.json`, đường dẫn tệp, ảnh và bài viết; báo lỗi theo từng mục.
2. **Xử lý ảnh** theo từng lượt ngắn (có tiến độ). Đóng trang giữa chừng thì mở lại **Nhập gói** và bấm **Tiếp tục**; lượt chờ quá 24 giờ tự bị bỏ và dọn ảnh tạm.
3. **Xem trước**: mỗi mục ghi **Tạo mới / Cập nhật / Giữ nguyên**, trường nào thay đổi, ảnh mới hay dùng lại, và hiển thị bài đúng như trên website (có chế độ xem khổ điện thoại). Mục sản phẩm ghi **sản phẩm đích** và danh sách video: thứ tự, tiêu đề, ảnh bìa, video nào **Thêm · vị trí N** hay **Bỏ qua · đã có**.
4. **Xác nhận** với **Lưu nháp** (mặc định) hoặc **Công khai**. Ghi tất cả trong một lần — lỗi giữa chừng thì không ghi gì; bấm lại không ghi trùng. Mục “Giữ nguyên” (không có gì mới) được bỏ qua. **Bỏ lượt nhập** xoá ảnh tạm, không đổi nội dung.
5. Bài nhập xong vẫn sửa được ở **Trang nội dung**, **Tin tức**, **Sản phẩm**.

| | Lưu nháp | Công khai |
|---|---|---|
| Trang, tin tức đang công khai | Lưu thành bản nháp, khách vẫn thấy bản cũ | Thay bản khách đang thấy |
| Trang, tin tức chưa công khai | Lưu nội dung, vẫn ẩn | Hiện trên website |
| Sản phẩm (Ẩn hoặc Hiện) | Lưu **bản nháp riêng** của sản phẩm; khách vẫn thấy bài cũ, trạng thái Ẩn/Hiện giữ nguyên. Vào **Sản phẩm → sửa** để **Áp dụng bản nháp** hoặc **Bỏ** | Thay bài khách đang thấy và chuyển sản phẩm sang **Hiện** |

Với mọi lựa chọn: **không đổi giá, tồn kho, SKU, phiên bản, danh mục**. Nhập lại cùng gói: không tạo trùng bài hay ảnh (ảnh giống hệt được dùng lại).

## 7. Kiểm tra nhanh trước khi gửi gói

- [ ] `goi.json` ở gốc ZIP, đúng `dinh_dang` và `phien_ban`.
- [ ] Mọi `bai_viet`, `tep` trỏ đúng tệp có trong ZIP (phân biệt chữ hoa/thường).
- [ ] Mọi ảnh có `alt`.
- [ ] Sản phẩm đã có trên website (đúng `nguon` + `ma_san_pham` hoặc `slug`).
- [ ] `video_san_pham` (nếu có): mỗi video có `tieu_de`, `url` là link YouTube/TikTok đầy đủ (không phải mã nhúng, không phải link TikTok rút gọn); `anh_bia` trỏ đúng ảnh trong `anh/`.
- [ ] Danh mục: đúng `slug` danh mục đã có; chỉ ghi các trường muốn đổi (bỏ hẳn khoá để giữ nguyên, `""` để xoá).
- [ ] Không ghi giá, tồn kho, khuyến mại hay cam kết chưa được duyệt.
- [ ] `seo_title`/`seo_description` (nếu có) là chuỗi; muốn quay về mặc định thì ghi `""`, không ghi `null`.
