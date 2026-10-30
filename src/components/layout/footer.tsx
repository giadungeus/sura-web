import Link from "next/link";
import { siteConfig } from "@/config/site";
import { getRootCategories } from "@/lib/data/catalog";

export async function Footer() {
  const roots = await getRootCategories();
  return (
    <footer className="mt-16 border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
        <div className="space-y-2">
          <p className="text-base font-semibold">{siteConfig.name}</p>
          <p className="text-neutral-500">{siteConfig.description}</p>
        </div>
        <div>
          <p className="mb-3 font-medium">Ngành hàng</p>
          <ul className="grid grid-cols-2 gap-2 text-neutral-600 sm:grid-cols-1">
            {roots.map((c) => (
              <li key={c.slug}>
                <Link href={`/danh-muc/${c.slug}`} className="hover:text-neutral-900">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 font-medium">Hỗ trợ khách hàng</p>
          <ul className="space-y-2 text-neutral-600">
            <li>Hotline: 1900 0000 (8:00 – 21:00)</li>
            <li>Đổi trả miễn phí trong 7 ngày</li>
            <li>Giao hàng toàn quốc</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-neutral-200 py-4 text-center text-xs text-neutral-500">
        Website demo · Dữ liệu sản phẩm chỉ mang tính minh họa
      </div>
    </footer>
  );
}
