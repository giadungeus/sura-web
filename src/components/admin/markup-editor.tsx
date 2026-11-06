"use client";

import { useRef, useState } from "react";
import { Bold, Eye, Heading2, Heading3, ImagePlus, Link2, List, ListOrdered, Loader2, PencilLine, Table } from "lucide-react";
import { RichText } from "@/components/content/rich-text";
import { inputClass } from "@/components/admin/form-ui";
import { CONTENT_VARIABLE_HELP } from "@/lib/content/settings";
import { uploadContentImageAction } from "@/app/admin/content-actions";

type ToolKey = "h2" | "h3" | "ul" | "ol" | "bold" | "link" | "table" | "img";
const TOOLS: { key: ToolKey; label: string; icon: typeof Bold }[] = [
  { key: "h2", label: "Tiêu đề mục", icon: Heading2 },
  { key: "h3", label: "Tiêu đề nhỏ", icon: Heading3 },
  { key: "ul", label: "Danh sách", icon: List },
  { key: "ol", label: "Danh sách số", icon: ListOrdered },
  { key: "bold", label: "Chữ đậm", icon: Bold },
  { key: "link", label: "Liên kết", icon: Link2 },
  { key: "table", label: "Chèn bảng", icon: Table },
  { key: "img", label: "Chèn ảnh", icon: ImagePlus },
];

/**
 * Trình soạn thảo nhẹ: ô văn bản + nút chèn định dạng + xem trước (cùng bộ hiển thị với website).
 * Nội dung lưu dạng chữ (## tiêu đề, - danh sách, **đậm**, [liên kết](url)); không nhận HTML.
 */
export function MarkupEditor({
  id,
  name,
  value,
  onChange,
  vars,
  hiddenPaths,
  error,
  rows = 22,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  vars: Record<string, string>;
  hiddenPaths: readonly string[];
  error?: string;
  rows?: number;
}) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imageNote, setImageNote] = useState<string | null>(null);

  const apply = (next: string, selStart: number, selEnd: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  /** Thêm tiền tố cho các dòng đang chọn (tiêu đề, danh sách). */
  const prefixLines = (make: (i: number) => string) => {
    const el = ref.current;
    if (!el) return;
    const start = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const endNl = value.indexOf("\n", el.selectionEnd);
    const end = endNl === -1 ? value.length : endNl;
    const lines = value
      .slice(start, end)
      .split("\n")
      .map((l, i) => make(i) + l.replace(/^(#{2,3}\s+|[-*]\s+|\d{1,3}[.)]\s+)/, ""));
    const replaced = lines.join("\n");
    apply(value.slice(0, start) + replaced + value.slice(end), start, start + replaced.length);
  };

  const wrap = (before: string, after: string, placeholder: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    apply(next, s + before.length, s + before.length + selected.length);
  };

  const insertLink = () => {
    const url = window.prompt("Địa chỉ liên kết (https://…, /duong-dan, tel:…, mailto:…)", "https://");
    if (!url) return;
    wrap("[", `](${url.trim()})`, "chữ liên kết");
  };

  /** Chèn một khối (ảnh, bảng) thành đoạn riêng tại vị trí con trỏ. */
  const insertBlock = (block: string) => {
    const el = ref.current;
    const pos = el ? el.selectionEnd : value.length;
    const before = value.slice(0, pos).replace(/\s+$/, "");
    const after = value.slice(pos).replace(/^\s+/, "");
    const next = `${before}${before ? "\n\n" : ""}${block}${after ? "\n\n" : "\n"}${after}`;
    const start = before.length + (before ? 2 : 0);
    apply(next, start, start + block.length);
  };

  const insertTable = () => insertBlock("| Cột 1 | Cột 2 |\n| --- | --- |\n| Nội dung | Nội dung |");

  // Ảnh: tối ưu theo quy trình ảnh của website (WebP, xoá EXIF/GPS), bắt buộc có văn bản thay thế.
  const uploadImage = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setImageNote("Ảnh vượt quá 5 MB. Hãy chọn ảnh nhỏ hơn.");
      return;
    }
    const alt = window.prompt("Văn bản thay thế (mô tả ngắn nội dung ảnh, bắt buộc):", "")?.trim();
    if (!alt) {
      setImageNote("Chưa chèn ảnh: cần văn bản thay thế.");
      return;
    }
    const caption = window.prompt("Chú thích dưới ảnh (có thể để trống):", "")?.trim() ?? "";
    const fd = new FormData();
    fd.append("file", file);
    fd.append("alt", alt);
    fd.append("caption", caption);
    setUploading(true);
    setImageNote(null);
    try {
      const res = await uploadContentImageAction(fd);
      if (res.ok) {
        insertBlock(res.markup);
        setImageNote(res.note ?? null);
      } else setImageNote(res.message);
    } catch {
      setImageNote("Không tải được ảnh. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setUploading(false);
    }
  };

  const runTool = (key: ToolKey) => {
    if (key === "h2") prefixLines(() => "## ");
    else if (key === "h3") prefixLines(() => "### ");
    else if (key === "ul") prefixLines(() => "- ");
    else if (key === "ol") prefixLines((i) => `${i + 1}. `);
    else if (key === "bold") wrap("**", "**", "chữ đậm");
    else if (key === "table") insertTable();
    else if (key === "img") fileRef.current?.click();
    else insertLink();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <div role="tablist" aria-label="Chế độ" className="mr-2 inline-flex rounded-full bg-neutral-100 p-0.5 text-sm">
          {(
            [
              ["edit", "Soạn thảo", PencilLine],
              ["preview", "Xem trước", Eye],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-neutral-600 aria-selected:bg-white aria-selected:text-neutral-900 aria-selected:shadow-sm"
            >
              <Icon className="size-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
        {tab === "edit" &&
          TOOLS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => runTool(key)}
              title={label}
              aria-label={label}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
            >
              {key === "img" && uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
            </button>
          ))}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => uploadImage(e.target.files?.[0])}
        />
      </div>
      {imageNote && <p className="text-xs text-amber-800">{imageNote}</p>}

      {/* Ô nhập luôn nằm trong form (ẩn khi xem trước) để nội dung được gửi đi. */}
      <textarea
        ref={ref}
        id={id}
        name={name}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        hidden={tab === "preview"}
        spellCheck={false}
        className={inputClass(error, "font-mono text-sm leading-6")}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help`}
      />
      {tab === "preview" && (
        <div className="min-h-64 rounded-xl border border-dashed border-neutral-300 bg-white p-4 sm:p-6">
          {value.trim() ? (
            <RichText source={value} vars={vars} hiddenPaths={hiddenPaths} />
          ) : (
            <p className="text-sm text-neutral-500">Chưa có nội dung.</p>
          )}
        </div>
      )}

      <details id={`${id}-help`} className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
        <summary className="cursor-pointer font-medium text-neutral-800">Cách định dạng và biến dùng được</summary>
        <ul className="mt-2 space-y-1">
          <li>
            <code>## Tiêu đề mục</code>, <code>### Tiêu đề nhỏ</code> ở đầu dòng.
          </li>
          <li>
            <code>- mục</code> (danh sách), <code>1. mục</code> (danh sách số). Dòng trống để tách đoạn.
          </li>
          <li>
            <code>**chữ đậm**</code>, <code>[chữ](https://…)</code>. Liên kết chỉ nhận https/http, đường dẫn trong website
            (<code>/chinh-sach/…</code>), <code>tel:</code>, <code>mailto:</code>. Liên kết tới trang đang Nháp hiện như chữ thường.
          </li>
          <li>
            Ảnh: bấm <b>Chèn ảnh</b> (ảnh được tối ưu WebP, xoá thông tin vị trí). Dòng ảnh có dạng{" "}
            <code>![mô tả ảnh](/anh/….webp#rộngxcao &quot;chú thích&quot;)</code> — có thể sửa mô tả và chú thích.
          </li>
          <li>
            Bảng: bấm <b>Chèn bảng</b>, mỗi dòng <code>| ô | ô |</code>, dòng thứ hai là <code>| --- | --- |</code>.
          </li>
          <li>Không nhận mã HTML: mọi ký tự đều hiện như chữ.</li>
          <li>
            Biến lấy từ Cài đặt website:{" "}
            {CONTENT_VARIABLE_HELP.map((v, i) => (
              <span key={v.name}>
                {i > 0 && ", "}
                <code>{`{${v.name}}`}</code> ({v.label})
              </span>
            ))}
            .
          </li>
        </ul>
      </details>
    </div>
  );
}
