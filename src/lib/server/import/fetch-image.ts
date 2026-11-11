import "server-only";
import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { MAX_UPLOAD_BYTES } from "@/lib/server/images";

/**
 * Tải ảnh từ URL một cách an toàn (chống SSRF):
 * - chỉ http/https, không có tài khoản trong URL;
 * - địa chỉ IP được kiểm tra NGAY LÚC KẾT NỐI (hàm lookup riêng), chặn localhost,
 *   mạng nội bộ, link-local (169.254.x.x – metadata máy chủ), multicast…; kiểm tra lại
 *   sau mỗi lần chuyển hướng (tối đa 3);
 * - giới hạn thời gian (15 giây) và dung lượng (5 MB, dừng ngay khi vượt).
 * Ảnh trả về còn phải qua processImageBuffer (kiểm tra nội dung, mã hoá lại WebP).
 *
 * Chỉ để KIỂM THỬ trên máy: SHOP_IMPORT_ALLOW_PRIVATE_HOSTS=1 cho phép tải từ máy chủ nội bộ.
 */

export class ImageFetchError extends Error {}

const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return !blocked.check(mapped[1], "ipv4");
    return !blocked.check(address, "ipv6");
  }
  return false;
}

const allowPrivate = () => process.env.SHOP_IMPORT_ALLOW_PRIVATE_HOSTS === "1";

/**
 * Phân giải DNS rồi từ chối nếu địa chỉ không công khai — dùng trực tiếp làm địa chỉ kết nối.
 * Node mới (≥ 20, chọn họ địa chỉ tự động) gọi lookup với `all: true` và cần MẢNG địa chỉ; trả một địa chỉ sẽ lỗi
 * “Invalid IP address: undefined”. Hỗ trợ cả hai kiểu; với mảng, nếu có BẤT KỲ địa chỉ nội bộ nào thì từ chối cả.
 */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  if (options.all) {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, []);
      // IPv4 trước: container Docker thường không có đường IPv6, thử IPv6 trước có thể làm hỏng/chậm kết nối.
      const list = [...(addresses as unknown as { address: string; family: number }[])].sort((a, b) => a.family - b.family);
      const bad = list.find((a) => !isPublicAddress(a.address));
      if (!list.length || (!allowPrivate() && bad)) {
        return callback(new ImageFetchError(`Không cho phép tải ảnh từ địa chỉ nội bộ (${bad?.address ?? "không có địa chỉ"}).`), []);
      }
      callback(null, list);
    });
    return;
  }
  dnsLookup(hostname, { ...options, all: false }, (err, address, family) => {
    if (err) return callback(err, "", 0);
    if (!allowPrivate() && !isPublicAddress(String(address))) {
      return callback(new ImageFetchError(`Không cho phép tải ảnh từ địa chỉ nội bộ (${address}).`), "", 0);
    }
    callback(null, address as string, family as number);
  });
};

function requestOnce(url: URL, deadline: number): Promise<{ status: number; location?: string; contentType: string; body?: Buffer }> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new ImageFetchError("Quá thời gian tải ảnh (15 giây)."));
    const lib = url.protocol === "https:" ? https : http;
    // Giới hạn TỔNG thời gian (kể cả máy chủ gửi dữ liệu nhỏ giọt), không chỉ thời gian đứng im.
    const timer = setTimeout(() => req.destroy(new ImageFetchError("Quá thời gian tải ảnh (15 giây).")), remaining);
    const done = <T,>(fn: (v: T) => void) => (v: T) => {
      clearTimeout(timer);
      fn(v);
    };
    resolve = done(resolve);
    reject = done(reject);
    const req = lib.get(
      url,
      {
        lookup: safeLookup,
        timeout: Math.min(TIMEOUT_MS, remaining),
        headers: { "User-Agent": "ShopOnline-Importer/1.0", Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType: "" });
        }
        if (status !== 200) {
          res.resume();
          return reject(new ImageFetchError(`Máy chủ ảnh trả về mã ${status}.`));
        }
        const contentType = String(res.headers["content-type"] ?? "");
        if (!/^image\//i.test(contentType)) {
          res.resume();
          return reject(new ImageFetchError(`Không phải ảnh (Content-Type: ${contentType || "không có"}).`));
        }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > MAX_UPLOAD_BYTES) {
          res.destroy();
          return reject(new ImageFetchError("Ảnh vượt quá 5 MB."));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_UPLOAD_BYTES) {
            res.destroy();
            reject(new ImageFetchError("Ảnh vượt quá 5 MB."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, contentType, body: Buffer.concat(chunks) }));
        res.on("error", (e) => reject(new ImageFetchError(`Lỗi khi tải: ${e.message}`)));
      },
    );
    req.on("timeout", () => req.destroy(new ImageFetchError("Quá thời gian tải ảnh (15 giây).")));
    req.on("error", (e) => reject(e instanceof ImageFetchError ? e : new ImageFetchError(`Không tải được ảnh: ${e.message}`)));
  });
}

export async function fetchImageFromUrl(rawUrl: string): Promise<Buffer> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ImageFetchError("URL không hợp lệ.");
  }
  const deadline = Date.now() + TIMEOUT_MS; // tính chung cho cả các lần chuyển hướng
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new ImageFetchError("Chỉ nhận URL http/https.");
    if (url.username || url.password) throw new ImageFetchError("URL không được chứa tài khoản.");
    // Tên máy là IP trực tiếp: kiểm tra ngay (lookup không được gọi với IP).
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && !allowPrivate() && !isPublicAddress(host)) {
      throw new ImageFetchError(`Không cho phép tải ảnh từ địa chỉ nội bộ (${host}).`);
    }
    const res = await requestOnce(url, deadline);
    if (res.location) {
      url = new URL(res.location, url);
      continue;
    }
    return res.body!;
  }
  throw new ImageFetchError("Quá nhiều lần chuyển hướng.");
}
