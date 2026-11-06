# Nhập gói nội dung ZIP — ghi chú kỹ thuật

Trạng thái: **đã triển khai trên máy** (chưa lên hosting). Định dạng gói: `DINH-DANG.md`. Gói mẫu: `goi-mau-sura.zip` (nguồn `mau/`).

## Luồng
1. `POST /admin/nhap-goi/tai-len` (Route Handler, vì Server Action giới hạn 6 MB): kiểm tra phiên quản trị + `Origin`, đọc luồng tối đa 10 MB.
2. `readPackageZip` (`src/lib/server/package/zip.ts`, thư viện **yauzl 3.4**): giới hạn số tệp, dung lượng từng tệp / sau giải nén, tỉ lệ nén, tên tệp theo danh sách cho phép, chặn tệp mã hoá và liên kết tượng trưng. Không ghi tệp ra đĩa theo tên trong ZIP.
3. `validatePackage` (`manifest.ts`): `goi.json`, đường dẫn, alt, HTML/H1, ảnh phải nằm trong ZIP, sản phẩm phải đã có, mỗi nội dung một mục.
4. Lượt nhập lưu ở `package_imports`; ZIP tạm ở `.data/goi-tam/<id>.zip`; việc xử lý ảnh ở `package_import_images`.
5. Ảnh xử lý **từng ảnh một, mỗi lượt ≤ 12 giây** (`SHOP_IMPORT_IMAGE_BUDGET_MS`), giữ chỗ 60 giây, tối đa 3 lần thử. `optimizeImage` (`image-pipeline.ts`): vai trò `bia` ≤ 1200 px / mục tiêu 150 KB, `bai` ≤ 1400 px / 250 KB, chất lượng WebP 82 → 76 → 70, tối đa 500 KB, không phóng to.
6. Xem trước (`getPackagePreview`) và xác nhận (`commitPackage`) dùng **cùng** hàm lập kế hoạch; xác nhận chạy trong **một giao dịch** `BEGIN IMMEDIATE`, kiểm tra lại trạng thái/ảnh/sản phẩm, ghi kết quả; gửi lại → trả kết quả cũ.
7. Dọn dẹp: nhập xong / bỏ lượt / chờ quá 24 giờ → xoá ZIP tạm và ảnh đã xử lý mà CSDL không dùng.

## Ghi dữ liệu
| Loại | Lưu nháp | Công khai |
|---|---|---|
| Trang | Như trình sửa: trang công khai → `draft_title/draft_body`; trang nháp → ghi thẳng | ghi bản công khai, `is_public = 1` |
| Tin tức | Như trình sửa: bài công khai → `draft_json`; chưa công khai → ghi thẳng; bài mới → nháp | ghi bản công khai, `is_public = 1` |
| Sản phẩm | `products.content_draft_json` (tên, mô tả ngắn, bài, danh sách ảnh); ảnh mới là `product_images` chưa gắn (`product_id` NULL) | `applyProductDraft`: gắn ảnh, đặt ảnh đại diện, ghi tên/mô tả ngắn/bài, `is_visible = 1` |

Không câu lệnh nào đụng `price`, `stock`, SKU, `product_variants`, `category_id`.

## Thay đổi CSDL — migration v7 (chỉ thêm)
- Bảng `content_images` (ảnh trong bài/ảnh bìa; `UNIQUE(source_sha256, variant)` → không lưu trùng).
- Bảng `package_imports`, `package_import_images`.
- Cột `products.content_draft_json`, `product_images.alt`, `news_posts.cover_alt`.

## Phần dùng chung đã mở rộng
- `markup.ts` / `RichText`: khối ảnh (`![alt](/anh/<32 hex>.webp#WxH "chú thích")`, chỉ nhận ảnh đã lưu trên website) và bảng; ảnh trong bài `loading="lazy"`, có kích thước; bảng cuộn ngang trên điện thoại.
- `MarkupEditor`: nút **Chèn ảnh** (tối ưu như ảnh gói, bắt buộc alt) và **Chèn bảng** — dùng ở Trang nội dung, Tin tức và bài mô tả sản phẩm.
- Trang sản phẩm hiển thị bài mô tả bằng `RichText` (mô tả chữ thường từ CSV hiển thị như cũ); trang sửa sản phẩm có ô soạn bài và hộp **Bản nháp từ gói** (Áp dụng / Bỏ).
- `npm run backup`: đối chiếu cả ảnh nội dung.

## Cần kiểm tra trên hosting
- Máy chủ web trước Passenger (LiteSpeed/Apache/nginx) cho phép thân yêu cầu **≥ 10 MB** tới `/admin/nhap-goi/tai-len`. Chưa xác minh được từ máy này. Nếu bị chặn, trình duyệt nhận lỗi 413 hoặc lỗi kết nối.
- Thời gian giới hạn một yêu cầu ≥ ~30 giây (một lượt ảnh ≤ 12 giây + ảnh cuối).
- `npm run check:sharp` vẫn đạt (đã dùng chung `image-pipeline.ts`).
