"use client";

import { useActionState, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Plus, Star, Trash, Wand2, X } from "lucide-react";
import { ErrorText, Field, Notice, inputClass } from "@/components/admin/form-ui";
import { MarkupEditor } from "@/components/admin/markup-editor";
import { skuFromText, slugify } from "@/lib/slug";
import { SeoFields } from "@/components/admin/seo-fields";
import { clipText, defaultTitle, markupToPlainText } from "@/lib/seo-text";
import type { SelectedOptions } from "@/types";
import { saveProductAction, uploadProductImageAction, type FormState } from "../../catalog-actions";

const MAX_IMAGES = 10;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

type VariantRow = {
  uid: string;
  id: number | null;
  sku: string;
  options: SelectedOptions;
  price: string;
  compareAtPrice: string;
  stock: string;
};

type ImageItem = { id: number; url: string; width: number; height: number };

export type ProductFormValues = {
  id: string | null;
  name: string;
  slug: string;
  categoryId: number | null;
  brand: string;
  shortDescription: string;
  description: string;
  highlights: string[];
  isVisible: boolean;
  optionNames: string[];
  variants: { id: number; sku: string; options: SelectedOptions; price: number; compareAtPrice: number | null; stock: number }[];
  images: ImageItem[];
  primaryImageId: number | null;
  orderCount: number;
  seoTitle: string;
  seoDescription: string;
  /** Từng công khai → khoá slug (chưa có quản lý chuyển hướng). */
  everPublic: boolean;
};

let uidCounter = 0;
const uid = () => `r${++uidCounter}`;
const digits = (v: string) => v.replace(/[^\d]/g, "");
const groupThousands = (v: string) => (v ? Number(v).toLocaleString("vi-VN") : "");

export function ProductForm({
  initial,
  categories,
  vars,
  hiddenPaths,
}: {
  initial: ProductFormValues;
  categories: { id: number; name: string; depth: number }[];
  /** Cho phần Xem trước của trình soạn bài mô tả. */
  vars: Record<string, string>;
  hiddenPaths: string[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProductAction, {});
  const e = state.fieldErrors ?? {};

  const [name, setName] = useState(initial.name);
  const [slug, setSlug] = useState(initial.slug);
  const [slugTouched, setSlugTouched] = useState(initial.id !== null);
  const [categoryId, setCategoryId] = useState(initial.categoryId === null ? "" : String(initial.categoryId));
  const [brand, setBrand] = useState(initial.brand);
  const [shortDescription, setShortDescription] = useState(initial.shortDescription);
  const [description, setDescription] = useState(initial.description);
  const [highlights, setHighlights] = useState(initial.highlights.join("\n"));
  const [isVisible, setIsVisible] = useState(initial.isVisible);
  const [seo, setSeo] = useState({ seoTitle: initial.seoTitle, seoDescription: initial.seoDescription });
  const slugLocked = initial.id !== null && initial.everPublic;

  const [hasVariants, setHasVariants] = useState(initial.optionNames.length > 0);
  const [optionNames, setOptionNames] = useState<string[]>(initial.optionNames.length ? initial.optionNames : ["Màu sắc"]);
  const [optionValues, setOptionValues] = useState<string[]>(() =>
    (initial.optionNames.length ? initial.optionNames : ["Màu sắc"]).map((n) =>
      [...new Set(initial.variants.map((v) => v.options[n]).filter(Boolean))].join(", "),
    ),
  );
  const toRow = (v: ProductFormValues["variants"][number]): VariantRow => ({
    uid: uid(),
    id: v.id,
    sku: v.sku,
    options: v.options,
    price: String(v.price),
    compareAtPrice: v.compareAtPrice === null ? "" : String(v.compareAtPrice),
    stock: String(v.stock),
  });
  const [variants, setVariants] = useState<VariantRow[]>(() =>
    initial.variants.length
      ? initial.variants.map(toRow)
      : [{ uid: uid(), id: null, sku: "", options: {}, price: "", compareAtPrice: "", stock: "0" }],
  );
  // Khi chuyển kiểu (có/không biến thể) giữ lại dòng cũ để khôi phục nếu đổi ý.
  const simpleBackup = useRef<VariantRow | null>(null);

  const [images, setImages] = useState<ImageItem[]>(initial.images);
  const [primaryId, setPrimaryId] = useState<number | null>(initial.primaryImageId);
  const [uploading, setUploading] = useState(0);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const skuBase = skuFromText(slug || name).slice(0, 20) || "SP";

  // ───── Ảnh ─────
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const errors: string[] = [];
    const room = MAX_IMAGES - images.length;
    const list = Array.from(files);
    if (list.length > room) errors.push(`Chỉ thêm được ${Math.max(0, room)} ảnh nữa (tối đa ${MAX_IMAGES} ảnh).`);
    const accepted = list.slice(0, Math.max(0, room)).filter((f) => {
      if (!ACCEPT.includes(f.type)) {
        errors.push(`${f.name}: chỉ nhận JPEG, PNG hoặc WebP.`);
        return false;
      }
      if (f.size > MAX_BYTES) {
        errors.push(`${f.name}: vượt quá 5 MB.`);
        return false;
      }
      return true;
    });
    setUploadErrors(errors);
    // Tải lần lượt từng ảnh (server kiểm tra lại nội dung tệp).
    for (const file of accepted) {
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await uploadProductImageAction(fd);
        if (res.ok) {
          setImages((prev) => [...prev, res.image]);
          setPrimaryId((p) => p ?? res.image.id);
        } else {
          setUploadErrors((prev) => [...prev, res.message]);
        }
      } catch {
        setUploadErrors((prev) => [...prev, `${file.name}: không tải lên được (lỗi kết nối).`]);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const moveImage = (index: number, dir: -1 | 1) =>
    setImages((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  const removeImage = (id: number) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
    if (primaryId === id) setPrimaryId(images.find((i) => i.id !== id)?.id ?? null);
  };

  // ───── Biến thể ─────
  const toggleVariants = (on: boolean) => {
    setHasVariants(on);
    if (on) {
      simpleBackup.current = variants[0] ?? null;
      if (variants.length === 1 && Object.keys(variants[0].options).length === 0) {
        setVariants([{ ...variants[0], uid: uid(), id: variants[0].id, options: {} }]);
      }
    } else {
      setVariants([simpleBackup.current ? { ...simpleBackup.current, options: {} } : { ...variants[0], options: {} }]);
    }
  };

  const generateCombos = () => {
    const names = optionNames.map((n) => n.trim()).filter(Boolean);
    const values = names.map((_, i) =>
      [...new Set((optionValues[i] ?? "").split(",").map((v) => v.trim()).filter(Boolean))],
    );
    if (names.length === 0 || values.some((v) => v.length === 0)) {
      setUploadErrors([]);
      window.alert("Nhập tên thuộc tính và ít nhất một giá trị cho mỗi thuộc tính (cách nhau bằng dấu phẩy).");
      return;
    }
    let combos: SelectedOptions[] = [{}];
    for (let i = 0; i < names.length; i++) {
      combos = combos.flatMap((c) => values[i].map((v) => ({ ...c, [names[i]]: v })));
    }
    if (combos.length > 100) {
      window.alert(`Quá nhiều tổ hợp (${combos.length}). Tối đa 100 biến thể.`);
      return;
    }
    const template = variants[0];
    setVariants((prev) =>
      combos.map((options) => {
        // Giữ nguyên dòng đã có cùng thuộc tính (SKU, giá, tồn kho đã nhập).
        const match = prev.find((r) => names.every((n) => r.options[n] === options[n]));
        if (match) return { ...match, options };
        return {
          uid: uid(),
          id: null,
          sku: [skuBase, ...names.map((n) => skuFromText(options[n]))].join("-").slice(0, 40),
          options,
          price: template?.price ?? "",
          compareAtPrice: template?.compareAtPrice ?? "",
          stock: "0",
        };
      }),
    );
  };

  const updateRow = (rowUid: string, patch: Partial<VariantRow>) =>
    setVariants((prev) => prev.map((r) => (r.uid === rowUid ? { ...r, ...patch } : r)));

  const activeOptionNames = hasVariants ? optionNames.map((n) => n.trim()).filter(Boolean) : [];

  const payload = JSON.stringify({
    name,
    slug,
    categoryId,
    brand,
    shortDescription,
    description,
    highlights,
    isVisible,
    hasVariants,
    optionNames: activeOptionNames,
    variants: variants.map((r) => ({
      id: r.id,
      sku: r.sku,
      options: hasVariants ? Object.fromEntries(activeOptionNames.map((n) => [n, r.options[n] ?? ""])) : {},
      price: r.price,
      compareAtPrice: r.compareAtPrice,
      stock: r.stock,
    })),
    imageIds: images.map((i) => i.id),
    primaryImageId: primaryId,
    seoTitle: seo.seoTitle,
    seoDescription: seo.seoDescription,
  });

  const variantErrors = Object.entries(e).filter(([k]) => k.startsWith("variants."));
  const rowHasError = (i: number, field: string) => Boolean(e[`variants.${i}.${field}`]);

  return (
    <form action={action} className="space-y-5" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="payload" value={payload} />

      {state.message && !state.ok && <Notice tone="error">{state.message}</Notice>}
      {initial.orderCount > 0 && (
        <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
          Sản phẩm đã có trong {initial.orderCount} đơn hàng. Sửa tên, giá hoặc biến thể không làm thay đổi các đơn đã đặt.
        </p>
      )}

      {/* ───── Thông tin chung ───── */}
      <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold">Thông tin chung</h2>
        <Field id="p-name" label="Tên sản phẩm" required error={e.name}>
          <input
            id="p-name"
            value={name}
            maxLength={150}
            onChange={(ev) => {
              setName(ev.target.value);
              if (!slugTouched && !slugLocked) setSlug(slugify(ev.target.value));
            }}
            className={inputClass(e.name)}
            aria-invalid={e.name ? true : undefined}
          />
        </Field>
        <Field
          id="p-slug"
          label="Slug (đường dẫn)"
          required
          error={e.slug}
          hint={
            slugLocked
              ? `Đã khoá vì sản phẩm từng công khai — đổi slug sẽ làm hỏng đường dẫn /san-pham/${slug} đang có.`
              : `Hiển thị tại /san-pham/${slug || "…"}`
          }
        >
          <input
            id="p-slug"
            value={slug}
            readOnly={slugLocked}
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
          <Field id="p-category" label="Danh mục" required error={e.categoryId}>
            <select
              id="p-category"
              value={categoryId}
              onChange={(ev) => setCategoryId(ev.target.value)}
              className={inputClass(e.categoryId)}
              aria-invalid={e.categoryId ? true : undefined}
            >
              <option value="">— Chọn danh mục —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {"— ".repeat(c.depth)}
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="p-brand" label="Thương hiệu" error={e.brand}>
            <input id="p-brand" value={brand} maxLength={60} onChange={(ev) => setBrand(ev.target.value)} className={inputClass(e.brand)} />
          </Field>
        </div>
        <Field id="p-short" label="Mô tả ngắn" error={e.shortDescription} hint="Một câu tóm tắt, hiện dưới tên sản phẩm.">
          <input
            id="p-short"
            value={shortDescription}
            maxLength={300}
            onChange={(ev) => setShortDescription(ev.target.value)}
            className={inputClass(e.shortDescription)}
          />
        </Field>
        <div className="space-y-1.5">
          <label htmlFor="p-desc" className="block text-sm font-medium">
            Bài mô tả sản phẩm
          </label>
          <MarkupEditor
            id="p-desc"
            name="description_editor"
            value={description}
            onChange={setDescription}
            vars={vars}
            hiddenPaths={hiddenPaths}
            error={e.description}
            rows={12}
          />
          <p className="text-xs text-neutral-500">Tối đa 20.000 ký tự. Hỗ trợ tiêu đề mục, danh sách, bảng, ảnh; không nhận mã HTML.</p>
          {e.description && <ErrorText>{e.description}</ErrorText>}
        </div>
        <Field id="p-highlights" label="Điểm nổi bật" error={e.highlights} hint="Mỗi dòng một ý, tối đa 10 dòng.">
          <textarea
            id="p-highlights"
            rows={3}
            value={highlights}
            onChange={(ev) => setHighlights(ev.target.value)}
            className={inputClass(e.highlights)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isVisible} onChange={(ev) => setIsVisible(ev.target.checked)} className="size-4 accent-neutral-900" />
          Hiển thị trên cửa hàng (bỏ chọn để ẩn; sản phẩm ẩn không thể đặt mua)
        </label>
      </section>

      <SeoFields
        idPrefix="p"
        initial={seo}
        onChange={setSeo}
        errors={e}
        path={`/san-pham/${slug || "…"}`}
        defaultTitle={defaultTitle(name || "Tên sản phẩm", vars.thuong_hieu ?? "")}
        defaultDescription={shortDescription.trim() || clipText(markupToPlainText(description))}
      />

      {/* ───── Ảnh ───── */}
      <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Ảnh sản phẩm</h2>
            <p className="text-xs text-neutral-500">
              JPEG, PNG hoặc WebP, tối đa 5 MB/ảnh, {MAX_IMAGES} ảnh. Ảnh được nén lại và xoá thông tin vị trí (EXIF).
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={images.length >= MAX_IMAGES || uploading > 0}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-neutral-900 px-4 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-40"
          >
            {uploading > 0 ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            {uploading > 0 ? `Đang tải ${uploading} ảnh…` : "Tải ảnh lên"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT.join(",")}
            multiple
            hidden
            onChange={(ev) => void onFiles(ev.target.files)}
            aria-label="Chọn ảnh sản phẩm"
          />
        </div>
        {uploadErrors.length > 0 && (
          <div role="alert" className="space-y-1 rounded-xl bg-brand-50 p-3 text-sm text-brand-700">
            {uploadErrors.map((msg, i) => (
              <p key={i}>{msg}</p>
            ))}
          </div>
        )}
        {e.images && <ErrorText>{e.images}</ErrorText>}
        {images.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">
            Chưa có ảnh. Cửa hàng sẽ hiển thị ảnh minh hoạ theo danh mục.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {images.map((img, index) => {
              const isPrimary = img.id === primaryId;
              return (
                <li key={img.id} className={`overflow-hidden rounded-xl border-2 ${isPrimary ? "border-neutral-900" : "border-neutral-200"}`}>
                  <div className="relative aspect-square bg-neutral-50">
                    <Image src={img.url} alt={`Ảnh ${index + 1}`} fill unoptimized sizes="200px" className="object-cover" />
                    {isPrimary && (
                      <span className="absolute top-1.5 left-1.5 rounded-md bg-neutral-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                        Ảnh đại diện
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-1 p-1.5">
                    <button
                      type="button"
                      onClick={() => setPrimaryId(img.id)}
                      disabled={isPrimary}
                      className="inline-flex size-8 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 disabled:text-amber-500"
                      aria-label="Đặt làm ảnh đại diện"
                      title="Đặt làm ảnh đại diện"
                    >
                      <Star className={`size-4 ${isPrimary ? "fill-amber-400" : ""}`} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveImage(index, -1)}
                      disabled={index === 0}
                      className="inline-flex size-8 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
                      aria-label="Chuyển lên trước"
                    >
                      <ArrowLeft className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveImage(index, 1)}
                      disabled={index === images.length - 1}
                      className="inline-flex size-8 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
                      aria-label="Chuyển ra sau"
                    >
                      <ArrowRight className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="inline-flex size-8 items-center justify-center rounded-full text-neutral-600 hover:bg-brand-50 hover:text-brand-600"
                      aria-label="Bỏ ảnh"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ───── Giá & tồn kho ───── */}
      <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold">Giá và tồn kho</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Kiểu sản phẩm">
          {[
            { on: false, label: "Không có biến thể" },
            { on: true, label: "Có biến thể (màu, size…)" },
          ].map((opt) => (
            <button
              key={String(opt.on)}
              type="button"
              role="radio"
              aria-checked={hasVariants === opt.on}
              onClick={() => hasVariants !== opt.on && toggleVariants(opt.on)}
              className={`rounded-full border px-4 py-2 text-sm ${
                hasVariants === opt.on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 hover:border-neutral-500"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {hasVariants && (
          <div className="space-y-3 rounded-xl bg-neutral-50 p-3">
            <p className="text-sm text-neutral-600">
              Nhập thuộc tính và các giá trị (cách nhau bằng dấu phẩy), rồi bấm “Tạo các phiên bản”. Dòng đã có cùng thuộc
              tính được giữ nguyên.
            </p>
            {optionNames.map((optName, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
                <input
                  value={optName}
                  maxLength={30}
                  onChange={(ev) => setOptionNames((prev) => prev.map((n, j) => (j === i ? ev.target.value : n)))}
                  placeholder="Tên thuộc tính (vd. Màu sắc)"
                  aria-label={`Tên thuộc tính ${i + 1}`}
                  className={inputClass(e.optionNames)}
                />
                <input
                  value={optionValues[i] ?? ""}
                  onChange={(ev) => setOptionValues((prev) => prev.map((n, j) => (j === i ? ev.target.value : n)))}
                  placeholder="Giá trị, vd. Đen, Trắng, Xanh"
                  aria-label={`Giá trị của thuộc tính ${i + 1}`}
                  className={inputClass()}
                />
                <button
                  type="button"
                  onClick={() => {
                    setOptionNames((prev) => prev.filter((_, j) => j !== i));
                    setOptionValues((prev) => prev.filter((_, j) => j !== i));
                  }}
                  disabled={optionNames.length <= 1}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-neutral-300 px-3 text-sm hover:bg-white disabled:opacity-30"
                  aria-label={`Bỏ thuộc tính ${i + 1}`}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
            ))}
            {e.optionNames && <ErrorText>{e.optionNames}</ErrorText>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setOptionNames((p) => [...p, ""]);
                  setOptionValues((p) => [...p, ""]);
                }}
                disabled={optionNames.length >= 3}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 text-sm hover:border-neutral-500 disabled:opacity-40"
              >
                <Plus className="size-4" aria-hidden /> Thêm thuộc tính
              </button>
              <button
                type="button"
                onClick={generateCombos}
                className="inline-flex h-9 items-center gap-1 rounded-full bg-neutral-900 px-3 text-sm font-semibold text-white hover:bg-neutral-800"
              >
                <Wand2 className="size-4" aria-hidden /> Tạo các phiên bản
              </button>
            </div>
          </div>
        )}

        {e.variants && <ErrorText>{e.variants}</ErrorText>}
        <ul className="space-y-3">
          {variants.map((row, i) => (
            <li key={row.uid} className="rounded-xl border border-neutral-200 p-3">
              {hasVariants && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-neutral-500">Phiên bản {i + 1}</span>
                  {activeOptionNames.map((optName) => (
                    <input
                      key={optName}
                      value={row.options[optName] ?? ""}
                      maxLength={40}
                      onChange={(ev) => updateRow(row.uid, { options: { ...row.options, [optName]: ev.target.value } })}
                      placeholder={optName}
                      aria-label={`${optName} của phiên bản ${i + 1}`}
                      className={inputClass(rowHasError(i, "options") ? "x" : undefined, "!w-36")}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => setVariants((prev) => prev.filter((r) => r.uid !== row.uid))}
                    disabled={variants.length <= 1}
                    className="ml-auto inline-flex size-9 items-center justify-center rounded-full text-neutral-500 hover:bg-brand-50 hover:text-brand-600 disabled:opacity-30"
                    aria-label={`Xoá phiên bản ${i + 1}`}
                  >
                    <Trash className="size-4" aria-hidden />
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="space-y-1 text-xs text-neutral-500">
                  SKU *
                  <input
                    value={row.sku}
                    maxLength={40}
                    onChange={(ev) => updateRow(row.uid, { sku: ev.target.value.toUpperCase() })}
                    placeholder={`${skuBase}-01`}
                    className={inputClass(rowHasError(i, "sku") ? "x" : undefined, "font-mono")}
                  />
                </label>
                <label className="space-y-1 text-xs text-neutral-500">
                  Giá bán (₫) *
                  <input
                    inputMode="numeric"
                    value={groupThousands(row.price)}
                    onChange={(ev) => updateRow(row.uid, { price: digits(ev.target.value) })}
                    placeholder="199.000"
                    className={inputClass(rowHasError(i, "price") ? "x" : undefined)}
                  />
                </label>
                <label className="space-y-1 text-xs text-neutral-500">
                  Giá niêm yết (₫)
                  <input
                    inputMode="numeric"
                    value={groupThousands(row.compareAtPrice)}
                    onChange={(ev) => updateRow(row.uid, { compareAtPrice: digits(ev.target.value) })}
                    placeholder="Để trống nếu không giảm"
                    className={inputClass(rowHasError(i, "compareAtPrice") ? "x" : undefined)}
                  />
                </label>
                <label className="space-y-1 text-xs text-neutral-500">
                  Tồn kho *
                  <input
                    inputMode="numeric"
                    value={row.stock}
                    onChange={(ev) => updateRow(row.uid, { stock: digits(ev.target.value) })}
                    placeholder="0"
                    className={inputClass(rowHasError(i, "stock") ? "x" : undefined)}
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
        {variantErrors.length > 0 && (
          <div role="alert" className="space-y-1 rounded-xl bg-brand-50 p-3 text-sm text-brand-700">
            {variantErrors.map(([k, msg]) => (
              <p key={k}>{msg}</p>
            ))}
          </div>
        )}
        {hasVariants && (
          <button
            type="button"
            onClick={() =>
              setVariants((prev) => [
                ...prev,
                { uid: uid(), id: null, sku: "", options: {}, price: prev[0]?.price ?? "", compareAtPrice: "", stock: "0" },
              ])
            }
            className="inline-flex h-9 items-center gap-1 rounded-full border border-neutral-300 px-3 text-sm hover:border-neutral-500"
          >
            <Plus className="size-4" aria-hidden /> Thêm một phiên bản
          </button>
        )}
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex gap-3 border-t border-neutral-200 bg-neutral-50/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <button
          type="submit"
          disabled={pending || uploading > 0}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60 sm:flex-none"
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {initial.id === null ? "Thêm sản phẩm" : "Lưu thay đổi"}
        </button>
        <Link
          href="/admin/san-pham"
          className="inline-flex h-11 items-center rounded-full border border-neutral-300 bg-white px-5 text-sm hover:bg-neutral-50"
        >
          Huỷ
        </Link>
      </div>
    </form>
  );
}
