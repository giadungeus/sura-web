"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Field, Notice, inputClass } from "@/components/admin/form-ui";
import { CategoryIcon, ICON_KEYS } from "@/components/icons";
import { slugify } from "@/lib/slug";
import type { IconKey } from "@/types";
import { saveCategoryAction, type FormState } from "../../catalog-actions";

export type CategoryFormValues = {
  id: number | null;
  name: string;
  slug: string;
  description: string;
  icon: IconKey;
  parentId: number | null;
  sortOrder: number;
  isVisible: boolean;
};

export function CategoryForm({
  initial,
  parents,
}: {
  initial: CategoryFormValues;
  parents: { id: number; name: string; depth: number }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveCategoryAction, {});
  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  // Tự sinh slug từ tên khi tạo mới, cho tới khi người dùng sửa slug bằng tay.
  const [slugTouched, setSlugTouched] = useState(initial.id !== null);
  const [icon, setIcon] = useState<IconKey>(initial.icon);
  // Ô nhập đều được điều khiển để giữ nguyên nội dung khi server báo lỗi.
  const [parentId, setParentId] = useState(initial.parentId === null ? "" : String(initial.parentId));
  const [sortOrder, setSortOrder] = useState(String(initial.sortOrder));
  const [description, setDescription] = useState(initial.description);
  const [isVisible, setIsVisible] = useState(initial.isVisible);
  const e = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-5" noValidate>
      {initial.id !== null && <input type="hidden" name="id" value={initial.id} />}
      {state.message && !state.ok && <Notice tone="error">{state.message}</Notice>}

      <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <Field id="cat-name" label="Tên danh mục" required error={e.name}>
          <input
            id="cat-name"
            name="name"
            value={name}
            maxLength={80}
            onChange={(ev) => {
              setName(ev.target.value);
              if (!slugTouched) setSlug(slugify(ev.target.value));
            }}
            className={inputClass(e.name)}
            aria-invalid={e.name ? true : undefined}
          />
        </Field>
        <Field
          id="cat-slug"
          label="Slug (đường dẫn)"
          required
          error={e.slug}
          hint={`Hiển thị tại /danh-muc/${slug || "…"}. Chữ thường không dấu, số, dấu gạch ngang.`}
        >
          <input
            id="cat-slug"
            name="slug"
            value={slug}
            maxLength={80}
            onChange={(ev) => {
              setSlugTouched(true);
              setSlug(ev.target.value.toLowerCase());
            }}
            className={inputClass(e.slug, "font-mono")}
            aria-invalid={e.slug ? true : undefined}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="cat-parent" label="Danh mục cha" error={e.parentId} hint="Để trống nếu là ngành hàng cấp 1.">
            <select
              id="cat-parent"
              name="parentId"
              value={parentId}
              onChange={(ev) => setParentId(ev.target.value)}
              className={inputClass(e.parentId)}
            >
              <option value="">— Không có (ngành hàng cấp 1) —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {"— ".repeat(p.depth)}
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="cat-sort" label="Thứ tự" error={e.sortOrder} hint="Số nhỏ hiển thị trước (vd. 0, 10, 20).">
            <input
              id="cat-sort"
              name="sortOrder"
              type="number"
              step={1}
              value={sortOrder}
              onChange={(ev) => setSortOrder(ev.target.value)}
              className={inputClass(e.sortOrder)}
            />
          </Field>
        </div>
        <Field id="cat-desc" label="Mô tả ngắn" error={e.description}>
          <input
            id="cat-desc"
            name="description"
            value={description}
            onChange={(ev) => setDescription(ev.target.value)}
            maxLength={300}
            className={inputClass(e.description)}
          />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Biểu tượng</legend>
          <input type="hidden" name="icon" value={icon} />
          <div className="flex flex-wrap gap-2">
            {ICON_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                aria-pressed={icon === key}
                aria-label={key}
                className={`flex size-10 items-center justify-center rounded-xl border ${
                  icon === key ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"
                }`}
              >
                <CategoryIcon icon={key} className="size-5" />
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isVisible" value="1" checked={isVisible} onChange={(ev) => setIsVisible(ev.target.checked)} className="size-4 accent-neutral-900" />
          Hiển thị trên cửa hàng
        </label>
      </section>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {initial.id === null ? "Thêm danh mục" : "Lưu thay đổi"}
        </button>
        <Link href="/admin/danh-muc" className="inline-flex h-11 items-center rounded-full border border-neutral-300 px-5 text-sm hover:bg-neutral-50">
          Huỷ
        </Link>
      </div>
    </form>
  );
}
