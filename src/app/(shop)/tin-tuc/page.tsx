import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Newspaper } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { formatDate } from "@/lib/format-date";
import { getPublicNews, getSiteChrome, getSiteSettings, newsCoverUrl } from "@/lib/server/site-content";
import { pageMetadata } from "@/lib/seo";
import { defaultTitle } from "@/lib/seo-text";

export async function generateMetadata(): Promise<Metadata> {
  const [{ brandName }, posts] = await Promise.all([getSiteSettings(), getPublicNews()]);
  // Chưa có bài nào: không lập chỉ mục trang danh sách trống.
  return pageMetadata({ path: "/tin-tuc", title: defaultTitle("Tin tức", brandName), description: "", brand: brandName, noindex: posts.length === 0 });
}

export default function NewsListPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-4 sm:pt-6">
      <Breadcrumb items={[{ label: "Tin tức" }]} />
      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Tin tức</h1>
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-neutral-100" />}>
        <NewsList />
      </Suspense>
    </div>
  );
}

async function NewsList() {
  const [posts, { settings }] = await Promise.all([getPublicNews(), getSiteChrome()]);
  if (posts.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 px-6 py-14 text-center">
        <Newspaper className="size-10 text-neutral-300" aria-hidden />
        <p className="font-medium">Chưa có bài viết</p>
        <p className="max-w-md text-sm text-neutral-500">
          {settings.brandName} chưa đăng bài viết nào. Mời bạn quay lại sau.
        </p>
      </div>
    );
  }
  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => {
        const cover = newsCoverUrl(post.coverFile);
        return (
          <li key={post.slug}>
            <Link
              href={`/tin-tuc/${post.slug}`}
              className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 hover:border-neutral-300 hover:shadow-sm"
            >
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh đã chuẩn hoá WebP, phục vụ qua /anh
                <img src={cover} alt={post.coverAlt} className="aspect-[16/9] w-full object-cover" loading="lazy" decoding="async" />
              )}
              <div className="flex flex-1 flex-col gap-2 p-5">
                <time dateTime={post.publishedAt} className="text-xs text-neutral-500">
                  {formatDate(post.publishedAt)}
                </time>
                <h2 className="leading-snug font-semibold">{post.title}</h2>
                {post.summary && <p className="line-clamp-3 text-sm text-neutral-600">{post.summary}</p>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
