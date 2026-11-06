/**
 * Định dạng nội dung đơn giản cho trang nội dung và tin tức (module thuần, dùng chung server và
 * trình duyệt). KHÔNG nhận HTML: mọi ký tự đều hiển thị như chữ; kết quả được dựng bằng phần tử
 * React nên không thể chèn mã chạy được.
 *
 *   ## Tiêu đề mục          ### Tiêu đề nhỏ
 *   - mục danh sách          1. mục đánh số
 *   **chữ đậm**              [chữ liên kết](https://… | /duong-dan | tel:… | mailto:…)
 *   {hotline} …              biến lấy từ Cài đặt website
 *   ![văn bản thay thế](/anh/<32 hex>.webp#1200x800 "Chú thích")   ảnh (một dòng riêng)
 *   | Cột | Cột |  /  | --- | --- |  /  | ô | ô |                bảng
 * Dòng trống tách đoạn; xuống dòng trong một đoạn được giữ nguyên.
 * Ảnh chỉ nhận tệp đã lưu trên website (/anh/…webp) — không nhận ảnh từ trang web khác.
 */

export type Inline = { type: "text"; text: string } | { type: "strong"; children: Inline[] } | { type: "link"; href: string | null; children: Inline[] };

export type Block =
  | { type: "h2" | "h3"; children: Inline[]; id: string }
  | { type: "p"; lines: Inline[][] }
  | { type: "ul" | "ol"; items: Inline[][] }
  /** src = null khi đường dẫn ảnh không hợp lệ (chỉ hiện văn bản thay thế). */
  | { type: "img"; src: string | null; alt: string; caption: string; width: number | null; height: number | null }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

/** Dòng ảnh: ![alt](src "chú thích") — chú thích tuỳ chọn. */
export const IMAGE_LINE = /^!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"([^"\n]*)")?\)$/;
const STORED_IMAGE = /^\/anh\/([a-f0-9]{32}\.webp)(?:#(\d{1,5})x(\d{1,5}))?$/;

/** Ảnh hợp lệ trong nội dung: chỉ tệp đã lưu /anh/<32 hex>.webp, kèm kích thước tuỳ chọn. */
export function parseStoredImageSrc(raw: string): { src: string; fileName: string; width: number | null; height: number | null } | null {
  const m = raw.trim().match(STORED_IMAGE);
  if (!m) return null;
  return { src: `/anh/${m[1]}`, fileName: m[1], width: m[2] ? Number(m[2]) : null, height: m[3] ? Number(m[3]) : null };
}

const TABLE_SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Chỉ nhận liên kết an toàn. Trả về null nếu không hợp lệ (hiện như chữ thường). */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href || href.length > 500 || /[\s<>"'`]/.test(href)) return null;
  if (/^\/(?!\/)[^\\]*$/.test(href)) return href; // đường dẫn nội bộ, không phải //host
  if (/^#[\w-]+$/.test(href)) return href;
  if (/^tel:\+?[\d]{3,15}$/.test(href)) return href;
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(href)) return href;
  try {
    const u = new URL(href);
    if ((u.protocol === "https:" || u.protocol === "http:") && u.hostname) return href;
  } catch {}
  return null;
}

/** Thay {bien} bằng giá trị cài đặt; biến lạ giữ nguyên. */
export function applyVariables(source: string, vars: Record<string, string>): string {
  return source.replace(/\{([a-z_]{2,30})\}/g, (m, name: string) => (name in vars ? vars[name] : m));
}

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ type: "text", text: buf });
    buf = "";
  };
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "strong", children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "[") {
      const close = text.indexOf("](", i + 1);
      const end = close > i ? text.indexOf(")", close + 2) : -1;
      if (close > i + 1 && end > close + 2 && !text.slice(i + 1, close).includes("[")) {
        flush();
        out.push({
          type: "link",
          href: safeHref(text.slice(close + 2, end)),
          children: parseInline(text.slice(i + 1, close)),
        });
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return out;
}

export function headingId(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const inlineText = (nodes: Inline[]): string =>
  nodes.map((n) => (n.type === "text" ? n.text : inlineText(n.children))).join("");

export function parseMarkup(source: string): Block[] {
  const blocks: Block[] = [];
  let para: Inline[][] = [];
  let list: { type: "ul" | "ol"; items: Inline[][] } | null = null;
  const endPara = () => {
    if (para.length) blocks.push({ type: "p", lines: para });
    para = [];
  };
  const endList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      endPara();
      endList();
      continue;
    }
    const img = line.match(IMAGE_LINE);
    if (img) {
      endPara();
      endList();
      const stored = parseStoredImageSrc(img[2]);
      blocks.push({
        type: "img",
        src: stored?.src ?? null,
        alt: img[1].trim(),
        caption: (img[3] ?? "").trim(),
        width: stored?.width ?? null,
        height: stored?.height ?? null,
      });
      continue;
    }
    // Bảng: dòng tiêu đề bắt đầu bằng “|”, dòng kế tiếp là dòng phân cách “| --- |”.
    if (line.startsWith("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1].trim())) {
      endPara();
      endList();
      const header = splitRow(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = splitRow(lines[i]);
        rows.push(header.map((_, c) => parseInline(cells[c] ?? "")));
        i++;
      }
      i--;
      blocks.push({ type: "table", header: header.map((c) => parseInline(c)), rows });
      continue;
    }
    const h = line.match(/^(#{2,3})\s+(.+)$/);
    if (h) {
      endPara();
      endList();
      const children = parseInline(h[2]);
      blocks.push({ type: h[1].length === 2 ? "h2" : "h3", children, id: headingId(inlineText(children)) });
      continue;
    }
    const ul = line.match(/^[-*]\s+(.+)$/);
    const ol = line.match(/^\d{1,3}[.)]\s+(.+)$/);
    if (ul || ol) {
      endPara();
      const type = ul ? "ul" : "ol";
      if (list && list.type !== type) endList();
      if (!list) list = { type, items: [] };
      list.items.push(parseInline((ul ?? ol)![1]));
      continue;
    }
    endList();
    para.push(parseInline(line));
  }
  endPara();
  endList();
  return blocks;
}
