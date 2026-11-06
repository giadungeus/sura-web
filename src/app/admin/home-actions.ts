"use server";

import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH, getAdminSession } from "@/lib/server/admin-auth";
import { listAdminProducts } from "@/lib/server/admin-catalog";
import { getHomePickItems, isHomeSection, saveHomePicks, type HomePickItem } from "@/lib/server/home-picks";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect(`${ADMIN_LOGIN_PATH}?het-han=1&tiep=${encodeURIComponent("/admin/trang-chu")}`);
  return session;
}

export type HomeSearchItem = { id: string; name: string; imageUrl: string | null; isVisible: boolean; minPrice: number | null; totalStock: number };

/** Tìm sản phẩm theo tên, thương hiệu, slug hoặc SKU (dùng lại tìm kiếm của danh sách sản phẩm). */
export async function searchHomeProductsAction(q: string): Promise<HomeSearchItem[]> {
  await requireAdmin();
  const term = typeof q === "string" ? q.trim().slice(0, 60) : "";
  if (!term) return [];
  return listAdminProducts({ q: term, page: 1 })
    .items.slice(0, 10)
    .map((p) => ({ id: p.id, name: p.name, imageUrl: p.imageUrl, isVisible: p.isVisible, minPrice: p.minPrice, totalStock: p.totalStock }));
}

export type SaveHomeResult = { ok: true; items: HomePickItem[] } | { ok: false; message: string; items: HomePickItem[] };

/** Lưu cả danh sách (theo thứ tự) của một khu; trả về trạng thái mới nhất để hiển thị. */
export async function saveHomePicksAction(section: string, ids: unknown): Promise<SaveHomeResult> {
  const session = await requireAdmin();
  if (!isHomeSection(section)) return { ok: false, message: "Khu không hợp lệ.", items: [] };
  const result = await saveHomePicks(section, ids, session.username);
  const items = await getHomePickItems(section);
  return result.ok ? { ok: true, items } : { ok: false, message: result.message, items };
}
