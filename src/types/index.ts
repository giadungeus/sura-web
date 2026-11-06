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
  | "backpack"
  // Mở rộng (giữ nguyên 18 mã cũ ở trên)
  | "tablet"
  | "headphones"
  | "speaker"
  | "camera"
  | "watch"
  | "tv"
  | "gamepad"
  | "footprints"
  | "glasses"
  | "gem"
  | "refrigerator"
  | "washing-machine"
  | "bed"
  | "heart-pulse"
  | "pill"
  | "spray-can"
  | "milk"
  | "apple"
  | "coffee"
  | "utensils"
  | "wine"
  | "cake"
  | "bike"
  | "tent"
  | "plane"
  | "map"
  | "fuel"
  | "book-open"
  | "pen"
  | "graduation-cap"
  | "paw-print"
  | "dog"
  | "cat"
  | "fish"
  | "wrench"
  | "hammer"
  | "drill"
  | "flower"
  | "sprout"
  | "shovel"
  | "gift";

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
  /** Nội dung chi tiết đang công khai (định dạng nội dung; rỗng = không hiện). */
  body?: string;
  /** SEO tuỳ chọn (rỗng = mặc định) và thời điểm bản công khai thay đổi (null = chưa rõ). */
  seoTitle?: string;
  seoDescription?: string;
  publicUpdatedAt?: string | null;
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

/** Ảnh hiển thị của sản phẩm: ảnh thật (url) nếu có, nếu không thì nền màu + biểu tượng. */
export type ProductImage = {
  tone: Tone;
  icon: IconKey;
  url?: string;
};

export type ProductPhoto = {
  url: string;
  width: number;
  height: number;
  /** Văn bản thay thế; không có thì dùng tên sản phẩm. */
  alt?: string;
};

/** Một phiên bản có thể mua: SKU, thuộc tính, giá và tồn kho riêng. */
export type ProductVariant = {
  id: number;
  sku: string;
  /** Thuộc tính, vd. { "Màu sắc": "Đen", "Size": "M" }; rỗng nếu sản phẩm không có biến thể. */
  options: SelectedOptions;
  price: number;
  compareAtPrice?: number;
  stock: number;
};

/** Sản phẩm hiển thị ở cửa hàng (đọc từ CSDL). */
export type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  /** slug của danh mục mà sản phẩm thuộc về. */
  category: string;
  /** Giá thấp nhất trong các biến thể đang bán (VNĐ). */
  price: number;
  /** Giá niêm yết của biến thể có giá thấp nhất (VNĐ). */
  originalPrice?: number;
  rating: number;
  reviewCount: number;
  sold: number;
  /** Tổng tồn kho của các biến thể đang bán. */
  stock: number;
  shortDescription: string;
  description: string;
  highlights: string[];
  /** Thông số theo `key` của AttributeDef trong danh mục. */
  specs: Record<string, string>;
  /** Tên các thuộc tính biến thể theo thứ tự, vd. ["Màu sắc", "Size"]. */
  optionNames: string[];
  variants: ProductVariant[];
  tags?: ProductTag[];
  image: ProductImage;
  photos: ProductPhoto[];
  createdAt: string;
  /** SEO tuỳ chọn (rỗng = mặc định) và thời điểm bản công khai thay đổi (null = chưa rõ). */
  seoTitle?: string;
  seoDescription?: string;
  publicUpdatedAt?: string | null;
};

/** Định dạng dữ liệu mẫu ban đầu (src/data/products.ts), chỉ dùng cho bước nhập vào CSDL. */
export type SeedProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviewCount: number;
  sold: number;
  stock: number;
  shortDescription: string;
  description: string;
  highlights: string[];
  specs: Record<string, string>;
  variants?: VariantGroup[];
  tags?: ProductTag[];
  image: { tone: Tone; icon: IconKey };
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
  /** Đơn giá của biến thể lúc thêm vào giỏ (VNĐ); server luôn tính lại khi đặt. */
  unitPrice: number;
  quantity: number;
  stock: number;
  image: ProductImage;
};
