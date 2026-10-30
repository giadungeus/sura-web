/**
 * Lọc, sắp xếp và phân trang danh sách sản phẩm dựa trên tham số URL.
 * Dùng chung cho trang danh mục và trang tìm kiếm.
 */
import { siteConfig } from "@/config/site";
import type { Product } from "@/types";

export type SearchParamsRecord = Record<string, string | string[] | undefined>;

export const SORT_OPTIONS = [
  { value: "pho-bien", label: "Phổ biến" },
  { value: "moi-nhat", label: "Mới nhất" },
  { value: "gia-tang", label: "Giá thấp → cao" },
  { value: "gia-giam", label: "Giá cao → thấp" },
] as const;

export const PRICE_RANGES = [
  { value: "duoi-500k", label: "Dưới 500K", min: 0, max: 500_000 },
  { value: "500k-2tr", label: "500K – 2 triệu", min: 500_000, max: 2_000_000 },
  { value: "2tr-10tr", label: "2 – 10 triệu", min: 2_000_000, max: 10_000_000 },
  { value: "tren-10tr", label: "Trên 10 triệu", min: 10_000_000, max: Infinity },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];
export type PriceRangeValue = (typeof PRICE_RANGES)[number]["value"];

export type ListingParams = {
  sort: SortValue;
  price?: PriceRangeValue;
  brand?: string;
  page: number;
};

/** Tên tham số trên URL (tiếng Việt không dấu). */
const PARAM = {
  sort: "sap-xep",
  price: "gia",
  brand: "thuong-hieu",
  page: "trang",
} as const;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseListingParams(searchParams: SearchParamsRecord): ListingParams {
  const sortRaw = first(searchParams[PARAM.sort]);
  const priceRaw = first(searchParams[PARAM.price]);
  const brand = first(searchParams[PARAM.brand])?.trim() || undefined;
  const pageRaw = Number.parseInt(first(searchParams[PARAM.page]) ?? "1", 10);

  const sort = SORT_OPTIONS.some((o) => o.value === sortRaw)
    ? (sortRaw as SortValue)
    : "pho-bien";
  const price = PRICE_RANGES.some((r) => r.value === priceRaw)
    ? (priceRaw as PriceRangeValue)
    : undefined;
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  return { sort, price, brand, page };
}

export type ListingResult = {
  items: Product[];
  total: number;
  page: number;
  totalPages: number;
  /** Các thương hiệu có trong tập sản phẩm gốc (trước khi lọc thương hiệu). */
  brands: string[];
};

export function applyListing(
  products: Product[],
  params: ListingParams,
  pageSize: number = siteConfig.pageSize,
): ListingResult {
  let list = products;

  if (params.price) {
    const range = PRICE_RANGES.find((r) => r.value === params.price)!;
    list = list.filter((p) => p.price >= range.min && p.price < range.max);
  }

  const brands = [...new Set(list.map((p) => p.brand))].sort((a, b) =>
    a.localeCompare(b, "vi"),
  );

  if (params.brand) {
    list = list.filter((p) => p.brand === params.brand);
  }

  const sorted = [...list];
  switch (params.sort) {
    case "moi-nhat":
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      break;
    case "gia-tang":
      sorted.sort((a, b) => a.price - b.price);
      break;
    case "gia-giam":
      sorted.sort((a, b) => b.price - a.price);
      break;
    default:
      sorted.sort((a, b) => b.sold - a.sold);
  }

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(params.page, totalPages);
  const items = sorted.slice((page - 1) * pageSize, page * pageSize);

  return { items, total, page, totalPages, brands };
}

/**
 * Tạo đường dẫn với bộ lọc mới. Đổi bộ lọc sẽ đưa về trang 1,
 * trừ khi chính `page` được thay đổi.
 */
export function buildListingHref(
  basePath: string,
  baseQuery: Record<string, string | undefined>,
  current: ListingParams,
  changes: Partial<ListingParams>,
): string {
  const next: ListingParams = {
    ...current,
    page: "page" in changes ? (changes.page ?? 1) : 1,
    ...changes,
  };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(baseQuery)) {
    if (value) query.set(key, value);
  }
  if (next.sort !== "pho-bien") query.set(PARAM.sort, next.sort);
  if (next.price) query.set(PARAM.price, next.price);
  if (next.brand) query.set(PARAM.brand, next.brand);
  if (next.page > 1) query.set(PARAM.page, String(next.page));
  const qs = query.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
