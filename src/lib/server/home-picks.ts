/**
 * Sản phẩm chọn thủ công cho hai khu trang chủ (“Giảm giá sốc”, “Sản phẩm nổi bật”).
 * Lưu trong bảng site_settings (khoá `home_picks`, JSON danh sách mã sản phẩm theo thứ tự) — không cần migration,
 * không đụng các cài đặt khác. Không chọn → khu bị ẩn; không tự bổ sung từ nhãn hay số “đã bán”.
 */
import "server-only";
import { connection } from "next/server";
import { getCategories, getProducts } from "@/lib/data/catalog";
import { getDb, withTransaction } from "@/lib/server/db";
import type { Product } from "@/types";

export const HOME_SECTIONS = {
  "giam-gia": { label: "Giảm giá sốc", show: 4 },
  "noi-bat": { label: "Sản phẩm nổi bật", show: 8 },
} as const;
export type HomeSection = keyof typeof HOME_SECTIONS;
export const HOME_SECTION_KEYS = Object.keys(HOME_SECTIONS) as HomeSection[];
/** Số sản phẩm tối đa trong MỘT danh sách chọn (phần dư dùng làm dự phòng). */
export const HOME_PICK_MAX = 12;

const SETTING_KEY = "home_picks";
const PRODUCT_ID = /^[a-z0-9-]{1,40}$/;

export const isHomeSection = (v: unknown): v is HomeSection => typeof v === "string" && v in HOME_SECTIONS;

export function readHomePicks(): Record<HomeSection, string[]> {
  const row = getDb().prepare("SELECT value FROM site_settings WHERE key = ?").get(SETTING_KEY) as { value: string } | undefined;
  let raw: Record<string, unknown> = {};
  try {
    raw = row ? (JSON.parse(row.value) as Record<string, unknown>) : {};
  } catch {}
  const clean = (v: unknown) =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && PRODUCT_ID.test(x)))].slice(0, HOME_PICK_MAX) : [];
  return { "giam-gia": clean(raw["giam-gia"]), "noi-bat": clean(raw["noi-bat"]) };
}

/**
 * Phiên bản dùng cho thẻ sản phẩm ở trang chủ: phiên bản CÒN HÀNG có giá thấp nhất.
 * Giá niêm yết chỉ hiện khi chính phiên bản đó có giá niêm yết cao hơn giá bán.
 * Không còn phiên bản nào có hàng → null (không quảng bá giá của phiên bản hết hàng).
 */
export function homeCardProduct(p: Product): Product | null {
  const inStock = p.variants.filter((v) => v.stock > 0);
  if (inStock.length === 0) return null;
  const v = inStock.reduce((min, x) => (x.price < min.price ? x : min), inStock[0]);
  return { ...p, price: v.price, originalPrice: v.compareAtPrice && v.compareAtPrice > v.price ? v.compareAtPrice : undefined };
}

export type HomePickState = "showing" | "backup" | "hidden";
export type HomePickItem = {
  id: string;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  /** Giá/giá niêm yết của phiên bản sẽ hiển thị (nếu có). */
  price: number | null;
  originalPrice: number | null;
  state: HomePickState;
  /** Lý do không hiển thị (state = hidden). */
  reason: string | null;
};

type PickContext = { visible: Map<string, Product>; visibleCats: Set<string> };

async function pickContext(): Promise<PickContext> {
  const [products, categories] = await Promise.all([getProducts(), getCategories()]);
  return { visible: new Map(products.map((p) => [p.id, p])), visibleCats: new Set(categories.map((c) => c.slug)) };
}

/**
 * MỘT quy tắc dùng chung cho hiển thị ngoài cửa hàng, trạng thái trong quản trị và điều kiện thêm mới:
 * trả về thẻ sẽ hiển thị, hoặc lý do không hiển thị.
 */
function evaluatePick(section: HomeSection, id: string, ctx: PickContext) {
  const row = getDb()
    .prepare(
      `SELECT p.name, p.slug, p.is_visible, c.slug AS cat,
              (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1) AS variants
       FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?`,
    )
    .get(id) as { name: string; slug: string; is_visible: number; cat: string; variants: number } | undefined;
  const fail = (reason: string, card: Product | null = null) => ({ row, card, reason });
  if (!row) return fail("Sản phẩm đã bị xoá — được bỏ qua. Bấm Bỏ để xoá khỏi danh sách.");
  if (!row.is_visible) return fail("Sản phẩm đang Ẩn.");
  if (!ctx.visibleCats.has(row.cat)) return fail("Danh mục của sản phẩm đang Ẩn.");
  const p = ctx.visible.get(id);
  if (!p || row.variants === 0) return fail("Sản phẩm không có phiên bản đang bán.");
  const card = homeCardProduct(p);
  if (!card) return fail("Hết hàng.");
  if (section === "giam-gia" && !card.originalPrice)
    return fail("Phiên bản còn hàng có giá thấp nhất không có giá niêm yết cao hơn giá bán (không còn giảm giá).", card);
  return { row, card, reason: null as string | null };
}

/** Trạng thái từng mục đã chọn (cho trang quản trị) — dùng đúng quy tắc của trang chủ. */
export async function getHomePickItems(section: HomeSection): Promise<HomePickItem[]> {
  await connection();
  const ids = readHomePicks()[section];
  const ctx = await pickContext();
  let shown = 0;
  return ids.map((id): HomePickItem => {
    const { row, card, reason } = evaluatePick(section, id, ctx);
    const base = {
      id,
      name: row?.name ?? "(sản phẩm đã xoá)",
      slug: row?.slug ?? null,
      imageUrl: card?.image.url ?? null,
      price: card?.price ?? null,
      originalPrice: card?.originalPrice ?? null,
    };
    if (reason) return { ...base, state: "hidden", reason };
    shown++;
    return { ...base, state: shown <= HOME_SECTIONS[section].show ? "showing" : "backup", reason: null };
  });
}

/** Sản phẩm hiển thị ngoài cửa hàng: các mục hợp lệ đầu tiên theo thứ tự đã lưu. */
export async function getHomeSectionProducts(section: HomeSection): Promise<Product[]> {
  // Đọc lúc có yêu cầu (không dựng sẵn lúc build) để danh sách vừa lưu hiện ngay trong HTML.
  await connection();
  const ids = readHomePicks()[section];
  if (ids.length === 0) return [];
  const ctx = await pickContext();
  const out: Product[] = [];
  for (const id of ids) {
    const { card, reason } = evaluatePick(section, id, ctx);
    if (reason || !card) continue;
    out.push(card);
    if (out.length >= HOME_SECTIONS[section].show) break;
  }
  return out;
}

export type SaveHomePicksResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Lưu danh sách của một khu (kiểm tra ở máy chủ): tối đa 12, không trùng, mã hợp lệ, sản phẩm tồn tại.
 * Mã của sản phẩm đã xoá mà vốn có trong danh sách thì được bỏ qua an toàn; mã lạ mới thêm → lỗi.
 * “Giảm giá sốc”: sản phẩm THÊM MỚI phải đạt đúng điều kiện hiển thị ngay lúc thêm (Hiện, danh mục Hiện,
 * còn hàng, phiên bản còn hàng rẻ nhất có giá niêm yết > giá bán). Mục đã có mà tạm không đạt vẫn được giữ.
 * Chỉ ghi khoá `home_picks`; không đổi bất kỳ dữ liệu sản phẩm nào.
 */
export async function saveHomePicks(section: HomeSection, raw: unknown, username: string): Promise<SaveHomePicksResult> {
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string" || !PRODUCT_ID.test(x)))
    return { ok: false, message: "Danh sách sản phẩm không hợp lệ." };
  const ids = raw as string[];
  if (new Set(ids).size !== ids.length) return { ok: false, message: "Một sản phẩm chỉ được chọn một lần trong cùng khu." };
  if (ids.length > HOME_PICK_MAX) return { ok: false, message: `Mỗi khu chọn tối đa ${HOME_PICK_MAX} sản phẩm.` };
  await connection();
  const ctx = await pickContext();

  return withTransaction((db) => {
    const current = readHomePicks();
    const before = new Set(current[section]);
    const exists = db.prepare("SELECT name FROM products WHERE id = ?");
    const kept: string[] = [];
    for (const id of ids) {
      const p = exists.get(id) as { name: string } | undefined;
      if (!p) {
        if (before.has(id)) continue; // sản phẩm đã xoá: bỏ qua an toàn
        return { ok: false as const, message: "Có sản phẩm không tồn tại (có thể vừa bị xoá). Tải lại trang rồi thử lại." };
      }
      if (section === "giam-gia" && !before.has(id)) {
        const { reason } = evaluatePick(section, id, ctx);
        if (reason) return { ok: false as const, message: `Chưa thể đưa “${p.name}” vào “Giảm giá sốc”: ${reason}` };
      }
      kept.push(id);
    }
    const next = { ...current, [section]: kept };
    db.prepare(
      `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).run(SETTING_KEY, JSON.stringify(next), new Date().toISOString(), username);
    return { ok: true as const, message: "Đã lưu." };
  });
}
