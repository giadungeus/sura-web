import { formatDateTime } from "@/lib/format-date";

export type PublishState = "public" | "draft" | "hidden";

const STYLE: Record<PublishState, string> = {
  public: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  draft: "bg-neutral-100 text-neutral-700 ring-neutral-200",
  hidden: "bg-amber-50 text-amber-800 ring-amber-200",
};
const LABEL: Record<PublishState, string> = { public: "Công khai", draft: "Nháp", hidden: "Đã ẩn" };

export function PublishBadge({ state, hasDraft }: { state: PublishState; hasDraft?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${STYLE[state]}`}>
        {LABEL[state]}
      </span>
      {hasDraft && (
        <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-sky-800 ring-1 ring-sky-200 ring-inset">
          Có bản nháp chưa công khai
        </span>
      )}
    </span>
  );
}

export function UpdatedLine({ updatedAt, updatedBy, publishedAt }: { updatedAt: string | null; updatedBy: string | null; publishedAt: string | null }) {
  return (
    <p className="text-xs text-neutral-500">
      {updatedAt && (
        <>
          Cập nhật: {formatDateTime(updatedAt)}
          {updatedBy && ` · ${updatedBy === "khoi-tao" ? "dữ liệu khởi tạo" : updatedBy}`}
        </>
      )}
      {publishedAt && <> · Công khai lần cuối: {formatDateTime(publishedAt)}</>}
    </p>
  );
}
