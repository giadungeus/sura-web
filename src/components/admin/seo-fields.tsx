"use client";

import { useState } from "react";
import { SITE_URL } from "@/lib/seo-text";
import { inputClass } from "@/components/admin/form-ui";

export type SeoValue = { seoTitle: string; seoDescription: string };

/**
 * Hai ô SEO tuỳ chọn + bản xem trước đơn giản (mô phỏng kết quả tìm kiếm).
 * Để trống = dùng mặc định từ tên/mô tả. Đếm ký tự chỉ để tham khảo, không chặn lưu.
 */
export function SeoFields({
  idPrefix,
  initial,
  defaultTitle,
  defaultDescription,
  path,
  errors = {},
  names,
  onChange,
}: {
  idPrefix: string;
  initial: SeoValue;
  /** Tiêu đề/mô tả sẽ dùng khi để trống (tính từ dữ liệu đang sửa). */
  defaultTitle: string;
  defaultDescription: string;
  /** Đường dẫn công khai, vd. /san-pham/abc. */
  path: string;
  errors?: Record<string, string | undefined>;
  /** Đặt tên trường khi form gửi bằng FormData. */
  names?: { title: string; description: string };
  onChange?: (v: SeoValue) => void;
}) {
  const [value, setValue] = useState<SeoValue>(initial);
  const update = (patch: Partial<SeoValue>) => {
    const next = { ...value, ...patch };
    setValue(next);
    onChange?.(next);
  };
  const title = value.seoTitle.trim() || defaultTitle;
  const description = value.seoDescription.trim() || defaultDescription;
  const host = SITE_URL.replace(/^https?:\/\//, "");
  const crumbs = path.split("?")[0].split("/").filter(Boolean);

  return (
    <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="font-semibold">SEO (tuỳ chọn)</h2>
        <p className="text-sm text-neutral-500">Để trống để dùng mặc định. Không đổi tên hay nội dung hiển thị trên trang.</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-seo-title`} className="block text-sm font-medium">
          Tiêu đề SEO
        </label>
        <input
          id={`${idPrefix}-seo-title`}
          name={names?.title}
          value={value.seoTitle}
          maxLength={200}
          placeholder={defaultTitle}
          onChange={(ev) => update({ seoTitle: ev.target.value })}
          className={inputClass(errors.seoTitle)}
          aria-invalid={errors.seoTitle ? true : undefined}
        />
        <p className="text-xs text-neutral-500">
          {value.seoTitle.trim() ? `${value.seoTitle.trim().length} ký tự · dùng nguyên văn (không tự thêm tên thương hiệu)` : "Đang dùng mặc định"}
        </p>
        {errors.seoTitle && <p className="text-sm text-brand-700">{errors.seoTitle}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-seo-desc`} className="block text-sm font-medium">
          Mô tả SEO
        </label>
        <textarea
          id={`${idPrefix}-seo-desc`}
          name={names?.description}
          rows={3}
          value={value.seoDescription}
          maxLength={500}
          placeholder={defaultDescription || "Chưa có mô tả mặc định"}
          onChange={(ev) => update({ seoDescription: ev.target.value })}
          className={inputClass(errors.seoDescription)}
          aria-invalid={errors.seoDescription ? true : undefined}
        />
        <p className="text-xs text-neutral-500">
          {value.seoDescription.trim() ? `${value.seoDescription.trim().length} ký tự` : "Đang dùng mặc định"}
        </p>
        {errors.seoDescription && <p className="text-sm text-brand-700">{errors.seoDescription}</p>}
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3" aria-label="Xem trước kết quả tìm kiếm">
        <p className="mb-2 text-xs font-medium text-neutral-500">Xem trước (mô phỏng — Google có thể hiển thị khác)</p>
        <p className="truncate text-xs text-neutral-600">
          {host}
          {crumbs.length > 0 && ` › ${crumbs.join(" › ")}`}
        </p>
        <p className="mt-0.5 line-clamp-2 text-base leading-snug text-[#1a0dab]">{title}</p>
        <p className="mt-0.5 line-clamp-3 text-sm text-neutral-700">{description || "(không có mô tả — Google sẽ tự lấy đoạn văn trên trang)"}</p>
        <p className="mt-2 text-xs text-neutral-500">
          Tiêu đề {title.length} ký tự · mô tả {description.length} ký tự. Google tự cắt theo độ rộng màn hình; số ký tự chỉ để tham khảo.
        </p>
      </div>
    </section>
  );
}
