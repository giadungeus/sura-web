import { jsonLdString } from "@/lib/seo";

/** Thẻ dữ liệu có cấu trúc (JSON-LD), đã thoát ký tự “<” theo hướng dẫn của Next.js. */
export function JsonLd({ data }: { data: unknown }) {
  if (!data) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
