import { RichText } from "@/components/content/rich-text";
import { formatDateTime } from "@/lib/format-date";
import type { ProductDraftInfo } from "@/lib/server/package/service";
import { resolveProductDraftAction } from "../../../package-actions";

/** Bản nháp bài sản phẩm từ gói nội dung: khách chưa thấy; áp dụng hoặc bỏ tại đây. */
export function ProductDraftBox({
  productId,
  draft,
  vars,
  hiddenPaths,
}: {
  productId: string;
  draft: ProductDraftInfo;
  vars: Record<string, string>;
  hiddenPaths: string[];
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm sm:p-5">
      <div>
        <h2 className="font-semibold text-sky-900">Bản nháp bài viết từ gói nội dung</h2>
        <p className="text-xs text-sky-800">
          Lưu lúc {formatDateTime(draft.savedAt)} · {draft.savedBy}. Khách chưa thấy bản này. Áp dụng sẽ thay tên (nếu có), mô tả ngắn,
          bài mô tả, SEO (nếu bản nháp có) và thêm ảnh; <b>không</b> đổi giá, tồn kho, phiên bản, danh mục hay trạng thái Ẩn/Hiện.
        </p>
      </div>
      <details className="rounded-xl bg-white p-3">
        <summary className="cursor-pointer font-medium">Xem bản nháp</summary>
        <div className="mt-3 space-y-2">
          {(draft.seoTitle !== undefined || draft.seoDescription !== undefined) && (
            <p className="rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600">
              SEO khi áp dụng — tiêu đề: {draft.seoTitle || "(mặc định)"}; mô tả: {draft.seoDescription || "(mặc định)"}
            </p>
          )}
          {draft.name && <p className="text-lg font-bold">{draft.name}</p>}
          {draft.summary && <p className="text-neutral-600">{draft.summary}</p>}
          {draft.images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {draft.images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh đã tối ưu
                <img key={img.url} src={img.url} alt={img.alt} className="size-20 rounded-lg border border-neutral-200 object-cover" />
              ))}
            </div>
          )}
          {draft.videos.length > 0 && (
            <div className="rounded-lg bg-neutral-50 p-2 text-xs text-neutral-700">
              <p className="font-medium">Video sẽ nối thêm khi áp dụng (bỏ qua video đã có):</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                {draft.videos.map((v) => (
                  <li key={v.url}>
                    {v.title} <span className="text-neutral-500">· {v.platform === "youtube" ? "YouTube" : "TikTok"}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <RichText source={draft.description} vars={vars} hiddenPaths={hiddenPaths} />
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <form action={resolveProductDraftAction}>
          <input type="hidden" name="id" value={productId} />
          <input type="hidden" name="apply" value="1" />
          <button type="submit" className="h-9 rounded-full bg-neutral-900 px-4 font-semibold text-white hover:bg-neutral-800">
            Áp dụng bản nháp
          </button>
        </form>
        <form action={resolveProductDraftAction}>
          <input type="hidden" name="id" value={productId} />
          <input type="hidden" name="apply" value="0" />
          <button type="submit" className="h-9 rounded-full border border-brand-200 bg-white px-4 text-brand-700 hover:bg-brand-50">
            Bỏ bản nháp
          </button>
        </form>
      </div>
    </section>
  );
}
