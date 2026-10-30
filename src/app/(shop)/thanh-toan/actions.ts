"use server";

import { cookies } from "next/headers";
import { validateCustomer } from "@/lib/checkout/customer";
import type { PlaceOrderResult, QuoteResult } from "@/lib/checkout/types";
import {
  ORDER_ACCESS_COOKIE_PREFIX,
  createOrder,
  createOrderAccessToken,
} from "@/lib/server/orders";
import { parseItems, priceItems } from "@/lib/server/pricing";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Báo giá cho trang thanh toán: kiểm tra từng sản phẩm và tính tiền phía server. */
export async function previewOrder(rawItems: unknown): Promise<QuoteResult> {
  const items = parseItems(rawItems);
  if (!items) return { ok: false, message: "Dữ liệu giỏ hàng không hợp lệ." };
  return { ok: true, quote: await priceItems(items) };
}

/**
 * Tạo đơn hàng thử nghiệm (COD). Mọi dữ liệu đều được kiểm tra lại ở đây;
 * giá và tổng tiền luôn do server tính.
 */
export async function placeOrder(raw: unknown): Promise<PlaceOrderResult> {
  const input = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  const idempotencyKey = input.idempotencyKey;
  if (typeof idempotencyKey !== "string" || !UUID_PATTERN.test(idempotencyKey)) {
    return { ok: false, kind: "server", message: "Yêu cầu không hợp lệ. Vui lòng tải lại trang." };
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

    (await cookies()).set({
      name: `${ORDER_ACCESS_COOKIE_PREFIX}${code}`,
      value: createOrderAccessToken(code),
      httpOnly: true,
      sameSite: "lax",
      // Bật `secure` khi chạy qua HTTPS (lúc triển khai thật).
      secure: false,
      path: `/don-hang/${code}`,
      maxAge: 60 * 60 * 24 * 30,
    });

    return { ok: true, code };
  } catch (error) {
    // Không ghi thông tin khách hàng vào log.
    console.error("[placeOrder] Lỗi lưu đơn hàng:", error instanceof Error ? error.message : error);
    return {
      ok: false,
      kind: "server",
      message: "Không lưu được đơn hàng do lỗi hệ thống. Giỏ hàng của bạn vẫn được giữ nguyên, vui lòng thử lại sau.",
    };
  }
}
