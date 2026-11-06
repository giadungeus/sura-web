import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/content/rich-text";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { formatDate } from "@/lib/format-date";
import { JsonLd } from "@/components/seo/json-ld";
import { getPublicNewsPost, getSiteChrome, getSiteSettings, newsCoverUrl } from "@/lib/server/site-content";
import { articleLd, breadcrumbLd, pageMetadata } from "@/lib/seo";
import { resolveSeo } from "@/lib/seo-text";

type Props = PageProps<"/tin-tuc/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublicNewsPost((await params).slug);
  if (!post) return { title: "Không tìm thấy bài viết" };
  const { brandName } = await getSiteSettings();
  const { title, description } = resolveSeo(post, { name: post.title, description: post.summary || post.body }, brandName);
  const cover = newsCoverUrl(post.coverFile);
  return pageMetadata({
    path: `/tin-tuc/${post.slug}`,
    title,
    description,
    brand: brandName,
    type: "article",
    image: cover ? { url: cover, alt: post.coverAlt || post.title } : null,
  });
}

// Bài viết sửa trong Quản trị → Tin tức; bài nháp/đã ẩn trả về “không tìm thấy”.
export default function NewsPostPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-3xl animate-pulse px-4 pt-6" aria-busy="true" />}>
      <PostContent params={params} />
    </Suspense>
  );
}

async function PostContent({ params }: { params: Props["params"] }) {
  const post = await getPublicNewsPost((await params).slug);
  if (!post) notFound();
  const { vars, hiddenPaths, settings } = await getSiteChrome();
  const cover = newsCoverUrl(post.coverFile);
  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 sm:pt-6">
      <JsonLd
        data={breadcrumbLd([
          { name: "Tin tức", path: "/tin-tuc" },
          { name: post.title, path: `/tin-tuc/${post.slug}` },
        ])}
      />
      <JsonLd data={articleLd({ title: post.title, slug: post.slug, coverUrl: cover, publishedAt: post.publishedAt, publicUpdatedAt: post.publicUpdatedAt }, settings)} />
      <Breadcrumb items={[{ label: "Tin tức", href: "/tin-tuc" }, { label: post.title }]} />
      <article className="mt-4">
        <time dateTime={post.publishedAt} className="text-sm text-neutral-500">
          {formatDate(post.publishedAt)}
        </time>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{post.title}</h1>
        {post.summary && <p className="mt-3 text-neutral-600">{post.summary}</p>}
        {cover && (
          // Ảnh bìa ở đầu trang: tải ngay, ưu tiên cao (không trì hoãn).
          // eslint-disable-next-line @next/next/no-img-element -- ảnh đã chuẩn hoá WebP, phục vụ qua /anh
          <img src={cover} alt={post.coverAlt} className="mt-5 w-full rounded-2xl" loading="eager" fetchPriority="high" />
        )}
        <div className="mt-6">
          <RichText source={post.body} vars={vars} hiddenPaths={hiddenPaths} />
        </div>
      </article>
      <Link href="/tin-tuc" className="mt-8 inline-block text-sm font-medium underline underline-offset-4">
        ← Tất cả tin tức
      </Link>
    </div>
  );
}
