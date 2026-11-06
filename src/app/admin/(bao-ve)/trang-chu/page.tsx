import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/server/admin-auth";
import { HOME_PICK_MAX, HOME_SECTIONS, HOME_SECTION_KEYS, getHomePickItems } from "@/lib/server/home-picks";
import { HomePicksEditor } from "./home-picks-editor";

export const metadata: Metadata = { title: "Trang chủ" };

export default function HomePicksPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Trang chủ</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Chọn và sắp xếp sản phẩm cho từng khu. Mỗi khu chọn tối đa {HOME_PICK_MAX} sản phẩm; cửa hàng hiện các sản phẩm hợp lệ đầu
          tiên theo thứ tự. Khu không có sản phẩm hợp lệ sẽ bị ẩn. Thao tác ở đây không đổi giá, kho hay nội dung sản phẩm.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />}>
        <Sections />
      </Suspense>
    </div>
  );
}

async function Sections() {
  await requireAdmin("/admin/trang-chu");
  const lists = await Promise.all(HOME_SECTION_KEYS.map((s) => getHomePickItems(s)));
  return (
    <>
      {HOME_SECTION_KEYS.map((s, i) => (
        <HomePicksEditor
          key={s}
          section={s}
          label={HOME_SECTIONS[s].label}
          show={HOME_SECTIONS[s].show}
          max={HOME_PICK_MAX}
          note={
            s === "giam-gia"
              ? "Chỉ hiện sản phẩm còn hàng mà phiên bản rẻ nhất còn hàng có giá niêm yết cao hơn giá bán; mức giảm tính theo đúng phiên bản đó."
              : "Chỉ hiện sản phẩm đang Hiện và còn hàng; giá trên thẻ là phiên bản rẻ nhất còn hàng."
          }
          initial={lists[i]}
        />
      ))}
    </>
  );
}
