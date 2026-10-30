/** Tên biểu tượng dùng cho danh mục và ảnh minh họa sản phẩm. */
export type IconKey =
  | "monitor-smartphone"
  | "smartphone"
  | "laptop"
  | "shirt"
  | "shopping-bag"
  | "house"
  | "cooking-pot"
  | "wind"
  | "sofa"
  | "lamp"
  | "sparkles"
  | "droplets"
  | "baby"
  | "puzzle"
  | "car"
  | "dumbbell"
  | "luggage"
  | "backpack";

/** Tông màu nền cho ảnh minh họa sản phẩm. */
export type Tone =
  | "slate"
  | "sky"
  | "rose"
  | "amber"
  | "emerald"
  | "violet"
  | "orange"
  | "teal";

/** Một thuộc tính kỹ thuật riêng của ngành hàng (vd. RAM, Size, Chất liệu). */
export type AttributeDef = {
  key: string;
  label: string;
};

export type Category = {
  slug: string;
  name: string;
  description: string;
  icon: IconKey;
  /** slug của danh mục cha; bỏ trống nếu là ngành hàng cấp 1. */
  parent?: string;
  /** Thứ tự và nhãn các thông số hiển thị ở trang chi tiết. */
  attributes?: AttributeDef[];
};

export type VariantOption = {
  label: string;
  /** Chênh lệch giá so với giá gốc của sản phẩm (VNĐ), có thể âm. */
  priceDelta?: number;
};

export type VariantGroup = {
  name: string;
  options: VariantOption[];
};

export type ProductTag = "noi-bat" | "moi";

export type ProductImage = {
  tone: Tone;
  icon: IconKey;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  /** slug của danh mục cấp cuối mà sản phẩm thuộc về. */
  category: string;
  /** Giá bán (VNĐ) cho lựa chọn mặc định. */
  price: number;
  /** Giá niêm yết trước giảm (VNĐ). */
  originalPrice?: number;
  rating: number;
  reviewCount: number;
  sold: number;
  stock: number;
  shortDescription: string;
  description: string;
  highlights: string[];
  /** Thông số theo `key` của AttributeDef trong danh mục. */
  specs: Record<string, string>;
  variants?: VariantGroup[];
  tags?: ProductTag[];
  image: ProductImage;
  createdAt: string;
};

/** Lựa chọn biến thể: tên nhóm -> nhãn lựa chọn. */
export type SelectedOptions = Record<string, string>;

export type CartItem = {
  /** Khóa duy nhất = sản phẩm + các biến thể đã chọn. */
  key: string;
  productId: string;
  slug: string;
  name: string;
  brand: string;
  options: SelectedOptions;
  /** Đơn giá đã gồm chênh lệch của biến thể (VNĐ). */
  unitPrice: number;
  quantity: number;
  stock: number;
  image: ProductImage;
};
