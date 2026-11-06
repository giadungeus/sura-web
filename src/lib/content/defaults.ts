/**
 * Nội dung mặc định của các trang — CHỈ dùng để khởi tạo khi CSDL chưa có trang đó.
 * Sau đó nội dung được sửa trong Quản trị → Trang nội dung; sửa tệp này không ghi đè nội dung đã có.
 * Biến {…} lấy từ Cài đặt website.
 */

export type DefaultPage = { slug: string; title: string; isPublic: boolean; body: string };

export const DEFAULT_PAGES: DefaultPage[] = [
  {
    slug: "gioi-thieu",
    title: "Giới thiệu {thuong_hieu}",
    isPublic: true,
    body: `{thuong_hieu} là website mua sắm đa ngành do {don_vi} vận hành.

## {thuong_hieu} bán gì?
Sản phẩm được sắp xếp theo các ngành hàng như điện tử, thời trang, nhà cửa, sắc đẹp, mẹ & bé, thể thao. Mỗi sản phẩm ghi rõ thương hiệu, giá bán, các phiên bản (màu sắc, dung lượng, kích cỡ…) và số lượng còn hàng tại thời điểm bạn xem.

## Mua hàng tại {thuong_hieu}
- **Miễn phí giao hàng toàn quốc** – không thu phí giao hàng trên đơn.
- **Thanh toán khi nhận hàng (COD)** – không cần tài khoản, không thanh toán trực tuyến.
- **Bảo hành theo chính sách của từng thương hiệu** – xem [Chính sách bảo hành](/chinh-sach/bao-hanh).

Các bước đặt hàng xem tại [Hướng dẫn mua hàng](/huong-dan-mua-hang).

## Liên hệ
- Hotline/Zalo: [{hotline}]({hotline_link}) · [nhắn Zalo]({zalo_link})
- Email: [{email}]({email_link})
- Địa chỉ: {dia_chi}`,
  },
  {
    slug: "lien-he",
    title: "Liên hệ",
    isPublic: true,
    body: `## Tiếp nhận yêu cầu hỗ trợ
Website chưa có biểu mẫu gửi yêu cầu trực tuyến. Để được hỗ trợ (hỏi về sản phẩm, đơn hàng, giao hàng, đổi trả hoặc bảo hành), vui lòng liên hệ qua hotline, Zalo hoặc email ở trên và cho biết:
- Họ tên và số điện thoại đã dùng khi đặt hàng;
- **Mã đơn hàng** (nếu có) – hiển thị trên trang xác nhận sau khi đặt hàng;
- Nội dung cần hỗ trợ; với sản phẩm gặp vấn đề, có thể gửi kèm ảnh hoặc video qua Zalo hoặc email.

Xem thêm: [Hướng dẫn mua hàng](/huong-dan-mua-hang) · [Chính sách đổi trả – hoàn tiền](/chinh-sach/doi-tra) · [Chính sách bảo hành](/chinh-sach/bao-hanh).`,
  },
  {
    slug: "huong-dan-mua-hang",
    title: "Hướng dẫn mua hàng",
    isPublic: true,
    body: `Đặt hàng không cần tạo tài khoản. Bạn thanh toán khi nhận hàng.

## 1. Chọn sản phẩm
Tìm sản phẩm bằng ô tìm kiếm hoặc theo danh mục. Ở trang sản phẩm, chọn phiên bản (nếu có, ví dụ màu sắc, dung lượng), số lượng, rồi bấm **Thêm vào giỏ** hoặc **Mua ngay** (thêm vào giỏ và chuyển tới giỏ hàng). Trang sản phẩm cho biết phiên bản còn bao nhiêu hàng hoặc đã hết hàng.

## 2. Kiểm tra giỏ hàng
Trong [giỏ hàng](/gio-hang), bạn có thể đổi số lượng hoặc bỏ sản phẩm. Giỏ hàng được lưu ngay trên trình duyệt bạn đang dùng, nên vẫn còn khi bạn quay lại sau trên cùng thiết bị và trình duyệt đó. Bấm **Tiến hành thanh toán** để tiếp tục.

## 3. Nhập thông tin nhận hàng
Ở trang thanh toán, điền:
- Họ và tên người nhận;
- Số điện thoại di động (10 chữ số);
- Địa chỉ nhận hàng đầy đủ: số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố;
- Ghi chú cho đơn hàng (không bắt buộc).

Phương thức thanh toán là **thanh toán khi nhận hàng (COD)**. Phí giao hàng: **miễn phí giao hàng toàn quốc**, tổng tiền hiển thị trước khi đặt đã gồm phí này.

## 4. Đặt hàng
Bấm **Đặt hàng**. Hệ thống kiểm tra lại giá và số lượng còn hàng ngay lúc đặt. Nếu giá đã thay đổi hoặc sản phẩm không còn đủ hàng, trang thanh toán sẽ báo để bạn xem lại trước khi đặt; đơn chưa được tạo.

Đặt thành công, bạn được chuyển tới trang đơn hàng có **mã đơn hàng**. Hãy lưu lại mã này. Trang đơn hàng chỉ mở được trên trình duyệt đã đặt đơn (trong 30 ngày); khi cần hỗ trợ ở thiết bị khác, hãy báo mã đơn cho {thuong_hieu}.

## 5. Theo dõi đơn hàng
Trạng thái đơn hiển thị trên trang đơn hàng:
1. **Chờ xác nhận** – đơn vừa được đặt;
2. **Đã xác nhận** – {thuong_hieu} đã xác nhận đơn;
3. **Đang giao** – đơn đang được giao tới bạn;
4. **Hoàn thành** – đơn đã được xử lý xong.

Muốn huỷ hoặc thay đổi đơn, vui lòng liên hệ {thuong_hieu} sớm, trước khi đơn chuyển sang “Đang giao”. Website chưa có nút tự huỷ đơn.

## Cần hỗ trợ?
Hotline/Zalo: [{hotline}]({hotline_link}) · Email: [{email}]({email_link})`,
  },
  {
    slug: "giao-hang",
    title: "Chính sách giao hàng",
    isPublic: true,
    body: `{thuong_hieu} áp dụng miễn phí giao hàng toàn quốc.

## Phí giao hàng
**Miễn phí giao hàng toàn quốc**: mọi đơn đặt trên website đều có phí giao hàng 0 ₫. Giỏ hàng, trang thanh toán và trang đơn hàng đều hiển thị phí giao hàng 0 ₫; tổng tiền bạn trả bằng tổng giá sản phẩm.

## Phạm vi giao hàng
Giao hàng tới địa chỉ bạn nhập khi đặt hàng, trên toàn quốc.

## Thông tin cần cung cấp
Để giao hàng, bạn cần nhập họ tên người nhận, số điện thoại di động và địa chỉ nhận hàng đầy đủ. Vui lòng kiểm tra kỹ trước khi đặt; nếu cần sửa địa chỉ sau khi đặt, hãy liên hệ {thuong_hieu} trước khi đơn chuyển sang trạng thái “Đang giao”.

## Thời gian giao hàng
Website hiện chưa công bố thời gian giao hàng cố định. Bạn có thể theo dõi trạng thái đơn trên trang đơn hàng (Chờ xác nhận → Đã xác nhận → Đang giao → Hoàn thành) hoặc liên hệ {thuong_hieu} để hỏi về đơn của mình.

## Thanh toán khi nhận hàng
Bạn thanh toán khi nhận hàng. Xem [Phương thức thanh toán](/chinh-sach/thanh-toan).

## Liên hệ
Hotline/Zalo: [{hotline}]({hotline_link}) · Email: [{email}]({email_link})`,
  },
  {
    slug: "thanh-toan",
    title: "Phương thức thanh toán",
    isPublic: true,
    body: `Hiện website hỗ trợ một phương thức: thanh toán khi nhận hàng (COD).

## Thanh toán khi nhận hàng (COD)
- Bạn đặt hàng trên website mà không phải trả trước.
- Khi nhận hàng, bạn thanh toán đúng số tiền “Tổng cộng” ghi trên trang đơn hàng.
- Miễn phí giao hàng toàn quốc: tổng cộng bằng tổng giá sản phẩm, không cộng thêm phí giao hàng.

## Website không thu thông tin thanh toán
Website không có thanh toán trực tuyến và không yêu cầu, không lưu số thẻ, tài khoản ngân hàng hay ví điện tử của bạn. Nếu có thay đổi về phương thức thanh toán, trang này sẽ được cập nhật.

## Cần hỗ trợ?
Hotline/Zalo: [{hotline}]({hotline_link}) · Email: [{email}]({email_link})`,
  },
  {
    slug: "bao-hanh",
    title: "Chính sách bảo hành",
    isPublic: true,
    body: `Sản phẩm mua tại {thuong_hieu} được bảo hành theo chính sách của từng thương hiệu. {thuong_hieu} tiếp nhận yêu cầu và phối hợp với thương hiệu để giải quyết.

## Bảo hành khác với đổi trả
- **Bảo hành** (của thương hiệu): sửa chữa hoặc thay thế khi sản phẩm gặp lỗi trong quá trình sử dụng, theo thời hạn và điều kiện của từng hãng.
- **Đổi trả – hoàn tiền** (của {thuong_hieu}): xử lý các trường hợp giao sai, thiếu, hỏng do vận chuyển hoặc lỗi nhà sản xuất phát hiện sau khi nhận hàng. Xem [Chính sách đổi trả – hoàn tiền](/chinh-sach/doi-tra).

## Thời hạn và điều kiện bảo hành
Thời hạn, phạm vi và điều kiện bảo hành do từng thương hiệu quy định và có thể khác nhau giữa các sản phẩm. {thuong_hieu} không áp dụng một thời hạn bảo hành chung cho mọi sản phẩm.

Nếu trang sản phẩm có ghi thông tin bảo hành (ví dụ trong phần thông số), đó là thông tin của riêng sản phẩm đó. Sản phẩm không ghi thông tin bảo hành: vui lòng liên hệ {thuong_hieu} để hỏi trước khi mua.

## Khi cần bảo hành
Liên hệ {thuong_hieu} để được hướng dẫn, và chuẩn bị:
- Mã đơn hàng, họ tên và số điện thoại đã dùng khi đặt hàng;
- Tên sản phẩm và mô tả tình trạng; có thể gửi kèm ảnh hoặc video qua Zalo hoặc email;
- Giấy tờ, phiếu bảo hành hoặc phụ kiện đi kèm sản phẩm (nếu có), vì thương hiệu có thể yêu cầu.

## Liên hệ
Hotline/Zalo: [{hotline}]({hotline_link}) · Email: [{email}]({email_link}) · Địa chỉ: {dia_chi}`,
  },
  {
    // Nội dung đã được duyệt; để ở trạng thái Nháp cho tới khi quản trị bấm “Công khai”.
    slug: "doi-tra",
    title: "Chính sách đổi trả – hoàn tiền",
    isPublic: false,
    body: `Chính sách này áp dụng cho sản phẩm mua trên website {thuong_hieu}. Chính sách không hạn chế các quyền của khách hàng theo quy định của pháp luật.

## Đổi trả khác với bảo hành
- **Đổi trả – hoàn tiền** (chính sách của {thuong_hieu}): xử lý các trường hợp nêu dưới đây.
- **Bảo hành** (của thương hiệu): sửa chữa hoặc thay thế khi sản phẩm gặp lỗi trong quá trình sử dụng, theo chính sách của từng thương hiệu; {thuong_hieu} tiếp nhận và phối hợp giải quyết. Xem [Chính sách bảo hành](/chinh-sach/bao-hanh).

## Các trường hợp được tiếp nhận
- Giao sai sản phẩm hoặc sai phiên bản;
- Thiếu hàng hoặc thiếu phụ kiện;
- Sản phẩm hư hỏng do vận chuyển;
- Sản phẩm lỗi do nhà sản xuất.

Hiện {thuong_hieu} **chưa hỗ trợ trả hàng chỉ vì đổi ý**.

## Thời gian thông báo
- Với trường hợp giao sai, thiếu hoặc hư hỏng do vận chuyển: {thuong_hieu} khuyến nghị bạn báo **trong 48 giờ** kể từ khi nhận hàng để việc kiểm tra được thuận lợi.
- Với lỗi nhà sản xuất: {thuong_hieu} hỗ trợ đổi trả **trong 7 ngày kể từ ngày bạn thực nhận hàng**. Ngày nhận hàng được xác định theo thực tế giao nhận.

## Giữ sản phẩm và bằng chứng
- Vui lòng giữ hộp, phụ kiện, quà tặng kèm, hoá đơn hoặc phiếu bảo hành (nếu có) và các ảnh, video liên quan.
- {thuong_hieu} khuyến khích quay video khi mở hộp; video không phải là bằng chứng duy nhất được chấp nhận.
- Sản phẩm lỗi không bị từ chối chỉ vì bạn đã mở hộp để sử dụng.

## Cách gửi yêu cầu
1. Liên hệ trước qua hotline/Zalo [{hotline}]({hotline_link}) ([nhắn Zalo]({zalo_link})) để được hướng dẫn, kèm mã đơn hàng, mô tả và ảnh/video.
2. {thuong_hieu} hướng dẫn cách gửi trả sản phẩm. Địa chỉ tiếp nhận: **{dia_chi}**.
3. {thuong_hieu} nhận và kiểm tra sản phẩm, rồi thông báo kết quả cho bạn.

## Chi phí gửi trả
Khi yêu cầu được xác định thuộc trường hợp được chấp nhận, {thuong_hieu} chịu phí gửi trả sản phẩm và phí gửi hàng đổi.

## Đổi sản phẩm
- Ưu tiên đổi sang **cùng sản phẩm, cùng phiên bản**.
- Đổi sang sản phẩm khác, cũng như số tiền bù thêm hoặc hoàn lại, cần được hai bên thống nhất trước.
- Nếu không có sản phẩm phù hợp để đổi, {thuong_hieu} hoàn tiền.

## Hoàn tiền
- Số tiền hoàn là **giá trị bạn thực trả** cho sản phẩm được chấp nhận trả.
- Hình thức: chuyển khoản ngân hàng, khi bạn đồng ý với hình thức này.
- Thời gian: **trong 5 ngày làm việc** sau khi {thuong_hieu} nhận sản phẩm, kiểm tra và xác nhận đủ điều kiện.

## Liên hệ
Hotline/Zalo: [{hotline}]({hotline_link}) · Email: [{email}]({email_link}) · Địa chỉ: {dia_chi}`,
  },
  {
    slug: "bao-mat",
    title: "Chính sách bảo mật thông tin",
    isPublic: true,
    body: `Trang này mô tả thông tin website {thuong_hieu} (do {don_vi} vận hành) thu thập khi bạn mua hàng và cách thông tin đó được dùng, lưu trữ.

## 1. Thông tin được thu thập
Website **không có tài khoản khách hàng**. Thông tin cá nhân chỉ được thu thập khi bạn đặt hàng:
- Họ và tên người nhận;
- Số điện thoại;
- Địa chỉ nhận hàng;
- Ghi chú bạn nhập cho đơn hàng (nếu có).

Cùng với đơn hàng, hệ thống lưu mã đơn, sản phẩm, phiên bản, số lượng, giá tại thời điểm đặt, tổng tiền, phương thức thanh toán (COD), thời điểm đặt và trạng thái xử lý đơn.

Website **không** thu thập số thẻ, tài khoản ngân hàng hay mật khẩu của khách hàng, và không gắn mã quảng cáo hay công cụ phân tích hành vi của bên thứ ba. Khi cần hoàn tiền bằng chuyển khoản theo chính sách đổi trả, bạn cung cấp thông tin tài khoản nhận tiền trực tiếp cho {thuong_hieu} qua Zalo hoặc email; thông tin này không được nhập hay lưu trên website.

## 2. Dữ liệu lưu trên trình duyệt của bạn
- **Giỏ hàng** được lưu trong bộ nhớ của trình duyệt (localStorage) trên thiết bị của bạn. Khi bạn mở trang thanh toán, sản phẩm trong giỏ được gửi lên máy chủ để tính giá và kiểm tra hàng; giỏ hàng không được lưu trên máy chủ nếu bạn không đặt hàng.
- Sau khi đặt hàng, trình duyệt nhận một **cookie** chỉ dùng để mở trang đơn hàng vừa đặt, có hiệu lực 30 ngày. Cookie này không chứa họ tên, số điện thoại hay địa chỉ.

Bạn có thể xoá giỏ hàng và cookie bằng chức năng xoá dữ liệu duyệt web của trình duyệt.

## 3. Mục đích sử dụng
- Xác nhận, xử lý và giao đơn hàng;
- Liên hệ với bạn về đơn hàng qua số điện thoại bạn cung cấp;
- Hỗ trợ khi bạn liên hệ về đơn hàng, giao hàng, đổi trả hoặc bảo hành.

## 4. Ai được xem thông tin
Thông tin đơn hàng chỉ xem được trong trang quản trị của website, nơi yêu cầu đăng nhập bằng tài khoản quản trị của {thuong_hieu}. Trang đơn hàng phía khách chỉ mở được trên trình duyệt đã đặt đơn (nhờ cookie nêu trên). Để giao hàng, thông tin nhận hàng cần thiết (họ tên, số điện thoại, địa chỉ, số tiền thu khi nhận hàng) có thể được cung cấp cho người hoặc đơn vị thực hiện việc giao hàng.

## 5. Lưu trữ và bảo vệ
- Dữ liệu đơn hàng được lưu trong cơ sở dữ liệu của website trên máy chủ hosting, và trong các bản sao lưu do {thuong_hieu} tạo để phòng sự cố.
- Website dùng kết nối HTTPS. Trang quản trị yêu cầu đăng nhập; mật khẩu quản trị được lưu dưới dạng mã hoá một chiều.
- Hệ thống hiện **chưa có thời hạn tự động xoá** dữ liệu đơn hàng.
- Máy chủ hosting có thể ghi nhật ký kỹ thuật (ví dụ địa chỉ IP, thời điểm và trang được truy cập) theo cấu hình của nhà cung cấp hosting.

## 6. Quyền của bạn
Bạn có thể liên hệ {thuong_hieu} để hỏi về thông tin của mình trong đơn hàng, đề nghị sửa thông tin sai hoặc đề nghị xoá. Vui lòng cung cấp mã đơn hàng và số điện thoại đã dùng để {thuong_hieu} xác định đúng đơn.

## 7. Liên hệ
Hotline/Zalo: [{hotline}]({hotline_link}) · Email: [{email}]({email_link}) · Địa chỉ: {dia_chi}`,
  },
  {
    slug: "dieu-kien-mua-hang",
    title: "Điều kiện mua hàng",
    isPublic: true,
    body: `Các điều kiện áp dụng khi bạn đặt hàng trên website {thuong_hieu}, do {don_vi} vận hành.

## 1. Đặt hàng
- Bạn đặt hàng không cần tài khoản, bằng cách nhập thông tin nhận hàng ở trang thanh toán.
- Bạn chịu trách nhiệm về tính chính xác của họ tên, số điện thoại và địa chỉ nhận hàng. Thông tin sai có thể khiến đơn không giao được.
- Đơn mới đặt ở trạng thái “Chờ xác nhận”. {thuong_hieu} có thể liên hệ qua số điện thoại bạn cung cấp để xác nhận đơn.

## 2. Giá và số lượng
- Giá niêm yết bằng đồng Việt Nam (₫).
- Giá và số lượng còn hàng được kiểm tra lại ngay khi bạn bấm Đặt hàng. Nếu có thay đổi, website báo để bạn xem lại trước khi đặt. Giá ghi trên đơn là giá tại thời điểm đặt.

## 3. Giao hàng và thanh toán
- Miễn phí giao hàng toàn quốc. Xem [Chính sách giao hàng](/chinh-sach/giao-hang).
- Thanh toán khi nhận hàng (COD). Xem [Phương thức thanh toán](/chinh-sach/thanh-toan).

## 4. Huỷ hoặc thay đổi đơn
Website chưa có chức năng tự huỷ đơn. Muốn huỷ hoặc thay đổi đơn, vui lòng liên hệ {thuong_hieu} trước khi đơn chuyển sang “Đang giao”.

## 5. Bảo hành, đổi trả
- Bảo hành theo chính sách của từng thương hiệu. Xem [Chính sách bảo hành](/chinh-sach/bao-hanh).
- Đổi trả, hoàn tiền: xem [Chính sách đổi trả – hoàn tiền](/chinh-sach/doi-tra), hoặc liên hệ {thuong_hieu} để được hỗ trợ.

## 6. Thông tin cá nhân
Cách thu thập và sử dụng thông tin xem tại [Chính sách bảo mật thông tin](/chinh-sach/bao-mat).

## 7. Liên hệ
Hotline/Zalo: [{hotline}]({hotline_link}) · Email: [{email}]({email_link}) · Địa chỉ: {dia_chi}`,
  },
];
