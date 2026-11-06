"use server";

import { cookies } from "next/headers";
import { validateCustomer } from "@/lib/checkout/customer";
import type { PlaceOrderResult, QuoteResult } from "@/lib/checkout/types";
import {
  ORDER_ACCESS_COOKIE_PREFIX,
  OrderConflictError,
  createOrder,
  createOrderAccessToken,
  findOrderCodeByIdempotencyKey,
} from "@/lib/server/orders";

/** Cấp cookie httpOnly cho phép trình duyệt này xem trang đơn hàng. */
async function grantOrderAccess(code: string) {
  (await cookies()).set({
    name: `${ORDER_ACCESS_COOKIE_PREFIX}${code}`,
    value: createOrderAccessToken(code),
    httpOnly: true,
    sameSite: "lax",
    // Chỉ gửi cookie qua HTTPS khi đặt SHOP_SECURE_COOKIES=1 (bật trên hosting https://sura.vn).
    secure: process.env.SHOP_SECURE_COOKIES === "1",
    path: `/don-hang/${code}`,
    maxAge: 60 * 60 * 24 * 30,
  });
}
import { parseItems, priceItems } from "@/lib/server/pricing";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Báo giá cho trang thanh toán: kiểm tra từng sản phẩm và tính tiền phía server. */
export async function previewOrder(rawItems: unknown): Promise<QuoteResult> {
  const items = parseItems(rawItems);
  if (!items) return { ok: false, message: "Dữ liệu giỏ hàng không hợp lệ." };
  return { ok: true, quote: await priceItems(items) };
}

/**
 * Tạo đơn hàng thật (COD, is_test = 0). Mọi dữ liệu đều được kiểm tra lại ở đây;
 * giá và tổng tiền luôn do server tính.
 */
export async function placeOrder(raw: unknown): Promise<PlaceOrderResult> {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  const idempotencyKey = input.idempotencyKey;
  if (typeof idempotencyKey !== "string" || !UUID_PATTERN.test(idempotencyKey)) {
    return { ok: false, kind: "server", message: "Yêu cầu không hợp lệ. Vui lòng tải lại trang." };
  }

  // Yêu cầu gửi lại sau khi đơn đã lưu (bấm lại, mạng chập chờn): trả về đơn cũ,
  // không kiểm tra hay trừ kho lần nữa.
  try {
    const existingCode = findOrderCodeByIdempotencyKey(idempotencyKey);
    if (existingCode) {
      await grantOrderAccess(existingCode);
      return { ok: true, code: existingCode };
    }
  } catch (error) {
    console.error("[placeOrder] Lỗi đọc CSDL:", error instanceof Error ? error.message : error);
    return { ok: false, kind: "server", message: "Hệ thống đang gặp lỗi, giỏ hàng vẫn được giữ nguyên. Vui lòng thử lại sau." };
  }

  const customer = validateCustomer(input.customer);
  if (!customer.ok) {
    return {
      ok: false,
      kind: "validation",
      message: "Vui lòng kiểm tra lại thông tin nhận hàng.",
      fieldErrors: customer.errors,
    };
  }

  const items = parseItems(input.items);
  if (!items) {
    return { ok: false, kind: "server", message: "Dữ liệu giỏ hàng không hợp lệ. Vui lòng tải lại trang." };
  }
  if (items.length === 0) {
    return { ok: false, kind: "cart", message: "Giỏ hàng đang trống.", issues: [] };
  }

  try {
    const quote = await priceItems(items);
    if (quote.issues.length > 0 || quote.lines.length === 0) {
      return {
        ok: false,
        kind: "cart",
        message: "Một số sản phẩm trong giỏ không còn hợp lệ. Vui lòng cập nhật giỏ hàng.",
        issues: quote.issues,
      };
    }
    // Chỉ so sánh để báo người mua; số tiền lưu vào đơn luôn là số server tự tính.
    if (input.expectedTotal !== quote.total) {
      return {
        ok: false,
        kind: "price-changed",
        message: "Giá hoặc tổng tiền vừa thay đổi. Vui lòng kiểm tra lại đơn hàng trước khi đặt.",
      };
    }

    const { code } = createOrder({
      idempotencyKey,
      customer: customer.value,
      lines: quote.lines,
      subtotal: quote.subtotal,
      shippingFee: quote.shippingFee,
      total: quote.total,
    });

    await grantOrderAccess(code);
    return { ok: true, code };
  } catch (error) {
    if (error instanceof OrderConflictError) {
      return error.kind === "cart"
        ? {
            ok: false,
            kind: "cart",
            message: "Một số sản phẩm vừa hết hàng hoặc không còn đủ số lượng. Vui lòng cập nhật giỏ hàng.",
            issues: error.issues,
          }
        : {
            ok: false,
            kind: "price-changed",
            message: "Giá sản phẩm vừa thay đổi. Vui lòng kiểm tra lại đơn hàng trước khi đặt.",
          };
    }
    // Không ghi thông tin khách hàng vào log.
    console.error("[placeOrder] Lỗi lưu đơn hàng:", error instanceof Error ? error.message : error);
    return {
      ok: false,
      kind: "server",
      message: "Không lưu được đơn hàng do lỗi hệ thống. Giỏ hàng của bạn vẫn được giữ nguyên, vui lòng thử lại sau.",
    };
  }
}
