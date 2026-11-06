/**
 * Bộ phân tích Markdown TỐI GIẢN cho câu trả lời của Trợ lý Sura. Chỉ tạo cây dữ liệu; giao diện dựng thành phần tử
 * React (không bao giờ dùng innerHTML) nên HTML trong câu trả lời luôn hiển thị dạng chữ, không chạy.
 * Hỗ trợ: đoạn văn, xuống dòng, **in đậm**, `mã`, tiêu đề nhỏ (#…), danh sách “- ”/“1. ”, bảng GFM, liên kết.
 */
export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] };
export type Block =
  | { t: "p"; lines: Inline[][] }
  | { t: "h"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; start: number; items: Inline[][] }
  | { t: "table"; head: Inline[][]; rows: Inline[][][] };

const MAX_BLOCKS = 200;
const MAX_COLS = 8;
const MAX_ROWS = 40;

/** Liên kết được phép bấm: http(s) tuyệt đối, hoặc đường dẫn nội bộ của website (bắt đầu bằng “/”). */
export function safeHref(raw: string): string | null {
  const s = raw.trim();
  if (/^\/(?!\/)[\w\-./%]*$/.test(s)) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

const TRAIL = /[.,;:!?)\]}»”’]+$/;
const INLINE = /`([^`\n]+)`|\*\*([^*\n]+?)\*\*|\[([^\]\n]{1,200})\]\(([^)\s]+)\)|(https?:\/\/[^\s<>"'`]+)/g;

export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const push = (v: string) => {
    if (!v) return;
    const prev = out[out.length - 1];
    if (prev && prev.t === "text") prev.v += v;
    else out.push({ t: "text", v });
  };
  for (const m of src.matchAll(INLINE)) {
    const start = m.index ?? 0;
    push(src.slice(last, start));
    last = start + m[0].length;
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] });
    else if (m[2] !== undefined) out.push(depth < 1 ? { t: "b", c: parseInline(m[2], depth + 1) } : { t: "text", v: m[2] });
    else if (m[3] !== undefined) {
      const href = safeHref(m[4]);
      const label = depth < 1 ? parseInline(m[3], depth + 1).filter((x) => x.t !== "link") : [{ t: "text" as const, v: m[3] }];
      if (href) out.push({ t: "link", href, c: label });
      else out.push(...label);
    } else if (m[5] !== undefined) {
      let url = m[5];
      const trail = url.match(TRAIL)?.[0] ?? "";
      if (trail) url = url.slice(0, -trail.length);
      const href = safeHref(url);
      if (href) out.push({ t: "link", href, c: [{ t: "text", v: url }] });
      else push(url);
      push(trail);
    }
  }
  push(src.slice(last));
  return out;
}

const SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .slice(0, MAX_COLS)
    .map((c) => parseInline(c.replace(/\\\|/g, "|").trim()));

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: Inline[][] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", lines: para });
    para = [];
  };
  for (let i = 0; i < lines.length && blocks.length < MAX_BLOCKS; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = line.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
    if (h) {
      flush();
      blocks.push({ t: "h", c: parseInline(h[1]) });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush(); // đường kẻ ngang → chỉ ngắt đoạn
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && SEP.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() && rows.length < MAX_ROWS) rows.push(cells(lines[i++]));
      i--;
      blocks.push({ t: "table", head, rows: rows.map((r) => (r.length < head.length ? [...r, ...Array.from({ length: head.length - r.length }, () => [])] : r.slice(0, head.length))) });
      continue;
    }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*(\d{1,3})[.)]\s+(.*)$/);
    if (ul || ol) {
      flush();
      const items: Inline[][] = [];
      const start = ol ? Number(ol[1]) : 1;
      const re = ul ? /^\s*[-*+]\s+(.*)$/ : /^\s*\d{1,3}[.)]\s+(.*)$/;
      while (i < lines.length) {
        const m = lines[i].match(re);
        if (m) items.push(parseInline(m[1]));
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1].push({ t: "text", v: " " }, ...parseInline(lines[i].trim()));
        else break;
        i++;
      }
      i--;
      blocks.push(ul ? { t: "ul", items } : { t: "ol", start, items });
      continue;
    }
    para.push(parseInline(line.trim()));
  }
  flush();
  return blocks;
}
