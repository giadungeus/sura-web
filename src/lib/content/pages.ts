/** Danh sách cố định các trang nội dung (sửa nội dung trong quản trị; không thêm/xoá trang). */

export type PageGroup = "about" | "support" | "policies";

export type PageDef = { slug: string; path: string; group: PageGroup; label: string };

export const CONTENT_PAGES: PageDef[] = [
  { slug: "gioi-thieu", path: "/gioi-thieu", group: "about", label: "Giới thiệu" },
  { slug: "lien-he", path: "/lien-he", group: "about", label: "Liên hệ" },
  { slug: "huong-dan-mua-hang", path: "/huong-dan-mua-hang", group: "support", label: "Hướng dẫn mua hàng" },
  { slug: "giao-hang", path: "/chinh-sach/giao-hang", group: "policies", label: "Chính sách giao hàng" },
  { slug: "thanh-toan", path: "/chinh-sach/thanh-toan", group: "policies", label: "Phương thức thanh toán" },
  { slug: "bao-hanh", path: "/chinh-sach/bao-hanh", group: "policies", label: "Chính sách bảo hành" },
  { slug: "doi-tra", path: "/chinh-sach/doi-tra", group: "policies", label: "Chính sách đổi trả – hoàn tiền" },
  { slug: "bao-mat", path: "/chinh-sach/bao-mat", group: "policies", label: "Chính sách bảo mật thông tin" },
  { slug: "dieu-kien-mua-hang", path: "/chinh-sach/dieu-kien-mua-hang", group: "policies", label: "Điều kiện mua hàng" },
];

export const POLICY_SLUGS = CONTENT_PAGES.filter((p) => p.group === "policies").map((p) => p.slug);

export const pageBySlug = (slug: string) => CONTENT_PAGES.find((p) => p.slug === slug);

export const CONTENT_TITLE_MAX = 150;
export const CONTENT_BODY_MAX = 50_000;

export type NavLink = { href: string; label: string };

/** Liên kết footer/menu, chỉ gồm trang đang công khai (tin tức luôn có). */
export function buildNavLinks(publicSlugs: ReadonlySet<string>, brandName: string) {
  const pick = (group: PageGroup): NavLink[] =>
    CONTENT_PAGES.filter((p) => p.group === group && publicSlugs.has(p.slug)).map((p) => ({ href: p.path, label: p.label }));
  const about = [...pick("about"), { href: "/tin-tuc", label: "Tin tức" }];
  const support = pick("support");
  if (publicSlugs.has("lien-he")) support.push({ href: "/lien-he#ho-tro", label: "Tiếp nhận yêu cầu hỗ trợ" });
  return {
    groups: [
      { title: `Về ${brandName}`, links: about },
      { title: "Hỗ trợ khách hàng", links: support },
      { title: "Chính sách", links: pick("policies") },
    ].filter((g) => g.links.length > 0),
    about,
    support,
  };
}

/** Đường dẫn của các trang nội dung KHÔNG công khai — liên kết tới chúng hiện thành chữ thường. */
export function hiddenPagePaths(publicSlugs: ReadonlySet<string>): string[] {
  return CONTENT_PAGES.filter((p) => !publicSlugs.has(p.slug)).map((p) => p.path);
}
