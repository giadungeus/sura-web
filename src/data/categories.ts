import type { Category } from "@/types";

const fashionAttributes = [
  { key: "chat-lieu", label: "Chất liệu" },
  { key: "kieu-dang", label: "Kiểu dáng" },
  { key: "xuat-xu", label: "Xuất xứ" },
];

const beautyAttributes = [
  { key: "loai-da", label: "Loại da phù hợp" },
  { key: "dung-tich", label: "Dung tích" },
  { key: "thanh-phan", label: "Thành phần nổi bật" },
  { key: "xuat-xu", label: "Xuất xứ" },
];

/**
 * Cây danh mục: ngành hàng cấp 1 (không có `parent`) và danh mục con.
 * Thêm ngành mới chỉ cần thêm dữ liệu ở đây, không cần sửa giao diện.
 */
export const categories: Category[] = [
  // Điện tử
  {
    slug: "dien-tu",
    name: "Điện tử",
    description: "Điện thoại, laptop và thiết bị công nghệ chính hãng.",
    icon: "monitor-smartphone",
  },
  {
    slug: "dien-thoai",
    name: "Điện thoại",
    description: "Điện thoại thông minh đủ phân khúc.",
    icon: "smartphone",
    parent: "dien-tu",
    attributes: [
      { key: "man-hinh", label: "Màn hình" },
      { key: "chip", label: "Chip xử lý" },
      { key: "ram", label: "RAM" },
      { key: "camera", label: "Camera sau" },
      { key: "pin", label: "Pin" },
    ],
  },
  {
    slug: "laptop",
    name: "Laptop",
    description: "Laptop văn phòng, mỏng nhẹ và gaming.",
    icon: "laptop",
    parent: "dien-tu",
    attributes: [
      { key: "cpu", label: "CPU" },
      { key: "ram", label: "RAM" },
      { key: "o-cung", label: "Ổ cứng" },
      { key: "man-hinh", label: "Màn hình" },
      { key: "trong-luong", label: "Trọng lượng" },
    ],
  },

  // Thời trang
  {
    slug: "thoi-trang",
    name: "Thời trang",
    description: "Quần áo, túi xách và phụ kiện cho nam và nữ.",
    icon: "shirt",
  },
  {
    slug: "thoi-trang-nam",
    name: "Thời trang nam",
    description: "Áo sơ mi, quần jean và trang phục nam.",
    icon: "shirt",
    parent: "thoi-trang",
    attributes: fashionAttributes,
  },
  {
    slug: "thoi-trang-nu",
    name: "Thời trang nữ",
    description: "Đầm, túi xách và trang phục nữ.",
    icon: "shopping-bag",
    parent: "thoi-trang",
    attributes: fashionAttributes,
  },

  // Nhà cửa
  {
    slug: "nha-cua",
    name: "Nhà cửa & Đời sống",
    description: "Đồ gia dụng, nội thất và trang trí nhà.",
    icon: "house",
  },
  {
    slug: "do-gia-dung",
    name: "Đồ gia dụng",
    description: "Thiết bị nhà bếp và điện gia dụng.",
    icon: "cooking-pot",
    parent: "nha-cua",
    attributes: [
      { key: "cong-suat", label: "Công suất" },
      { key: "dung-tich", label: "Dung tích / Diện tích" },
      { key: "bao-hanh", label: "Bảo hành" },
    ],
  },
  {
    slug: "noi-that",
    name: "Nội thất & Trang trí",
    description: "Bàn ghế, đèn và đồ trang trí.",
    icon: "sofa",
    parent: "nha-cua",
    attributes: [
      { key: "chat-lieu", label: "Chất liệu" },
      { key: "kich-thuoc", label: "Kích thước" },
      { key: "bao-hanh", label: "Bảo hành" },
    ],
  },

  // Sắc đẹp
  {
    slug: "sac-dep",
    name: "Sắc đẹp",
    description: "Chăm sóc da và trang điểm.",
    icon: "sparkles",
  },
  {
    slug: "cham-soc-da",
    name: "Chăm sóc da",
    description: "Sữa rửa mặt, kem chống nắng, dưỡng da.",
    icon: "droplets",
    parent: "sac-dep",
    attributes: beautyAttributes,
  },
  {
    slug: "trang-diem",
    name: "Trang điểm",
    description: "Son, phấn và mỹ phẩm trang điểm.",
    icon: "sparkles",
    parent: "sac-dep",
    attributes: beautyAttributes,
  },

  // Mẹ & Bé
  {
    slug: "me-va-be",
    name: "Mẹ & Bé",
    description: "Đồ chơi và sản phẩm chăm sóc bé.",
    icon: "baby",
  },
  {
    slug: "do-choi",
    name: "Đồ chơi",
    description: "Đồ chơi an toàn, phát triển tư duy.",
    icon: "puzzle",
    parent: "me-va-be",
    attributes: [
      { key: "do-tuoi", label: "Độ tuổi" },
      { key: "chat-lieu", label: "Chất liệu" },
      { key: "xuat-xu", label: "Xuất xứ" },
    ],
  },
  {
    slug: "cham-soc-be",
    name: "Chăm sóc bé",
    description: "Bỉm, bình sữa và đồ dùng cho bé.",
    icon: "baby",
    parent: "me-va-be",
    attributes: [
      { key: "do-tuoi", label: "Độ tuổi" },
      { key: "chat-lieu", label: "Chất liệu" },
      { key: "xuat-xu", label: "Xuất xứ" },
    ],
  },

  // Thể thao & Du lịch
  {
    slug: "the-thao",
    name: "Thể thao & Du lịch",
    description: "Dụng cụ tập luyện, vali và balo.",
    icon: "dumbbell",
  },
  {
    slug: "dung-cu-the-thao",
    name: "Dụng cụ thể thao",
    description: "Thảm yoga, tạ và phụ kiện tập luyện.",
    icon: "dumbbell",
    parent: "the-thao",
    attributes: [
      { key: "chat-lieu", label: "Chất liệu" },
      { key: "kich-thuoc", label: "Kích thước" },
      { key: "trong-luong", label: "Trọng lượng" },
    ],
  },
  {
    slug: "vali-balo",
    name: "Vali & Balo",
    description: "Vali kéo, balo laptop và du lịch.",
    icon: "luggage",
    parent: "the-thao",
    attributes: [
      { key: "chat-lieu", label: "Chất liệu" },
      { key: "kich-thuoc", label: "Kích thước" },
      { key: "trong-luong", label: "Trọng lượng" },
    ],
  },
];
