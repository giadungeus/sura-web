/**
 * Đọc CSV theo RFC 4180: ô có ngoặc kép, "" là dấu ngoặc kép, xuống dòng trong ô,
 * CRLF/LF. Tự nhận dấu phân cách "," hoặc ";" (Excel tiếng Việt hay lưu bằng ";").
 */

export type CsvParseResult =
  | { ok: true; delimiter: string; headers: string[]; rows: string[][] }
  | { ok: false; message: string };

export const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_CSV_ROWS = 2000;

/** Giải mã UTF-8 nghiêm ngặt (báo lỗi nếu không phải UTF-8) và bỏ BOM. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    return null;
  }
}

function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

export function parseCsv(text: string): CsvParseResult {
  const delimiter = detectDelimiter(text);
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      i++;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\r" || ch === "\n") {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
    } else {
      field += ch;
      i++;
    }
    if (records.length > MAX_CSV_ROWS + 1) {
      return { ok: false, message: `File có quá nhiều dòng (tối đa ${MAX_CSV_ROWS} dòng dữ liệu).` };
    }
  }
  if (inQuotes) return { ok: false, message: "File CSV bị lỗi: có ô mở ngoặc kép nhưng không đóng." };
  if (field !== "" || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  // Bỏ dòng trống hoàn toàn.
  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return { ok: false, message: "File CSV trống." };
  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase());
  const rows = nonEmpty.slice(1);
  if (rows.length === 0) return { ok: false, message: "File chỉ có dòng tiêu đề, chưa có dữ liệu." };
  if (rows.length > MAX_CSV_ROWS) return { ok: false, message: `File có ${rows.length} dòng, tối đa ${MAX_CSV_ROWS} dòng.` };
  return { ok: true, delimiter, headers, rows };
}
