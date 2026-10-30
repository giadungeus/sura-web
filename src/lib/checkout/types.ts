import type { FieldErrors } from "@/lib/checkout/customer";
import type { ProductImage, SelectedOptions } from "@/types";

/** Một dòng hàng trình duyệt gửi lên: chỉ tham chiếu sản phẩm, không gửi giá. */
export type OrderItemInput = {
  productId: string;
  options: SelectedOptions;
  quantity: number;
};

/** Dòng hàng đã được server kiểm tra và tính giá. */
export type PricedLine = {
  key: string;
  productId: string;
  slug: string;
  name: string;
  brand: string;
  options: SelectedOptions;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  image: ProductImage;
};

export type CartIssue = {
  key: string;
  message: string;
  fix: { type: "remove" } | { type: "set-quantity"; quantity: number };
};

export type Quote = {
  lines: PricedLine[];
  issues: CartIssue[];
  subtotal: number;
  shippingFee: number;
  shippingLabel: string;
  total: number;
};

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; message: string };

export type PlaceOrderInput = {
  idempotencyKey: string;
  customer: unknown;
  items: OrderItemInput[];
  /** Tổng tiền người mua đang thấy, chỉ dùng để phát hiện giá đã thay đổi. */
  expectedTotal: number;
};

export type PlaceOrderResult =
  | { ok: true; code: string }
  | { ok: false; kind: "validation"; message: string; fieldErrors: FieldErrors }
  | { ok: false; kind: "cart"; message: string; issues: CartIssue[] }
  | { ok: false; kind: "price-changed"; message: string }
  | { ok: false; kind: "server"; message: string };
