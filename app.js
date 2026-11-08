process.env.NODE_ENV = "production";
process.chdir(__dirname);

const http = require("node:http");
const net = require("node:net");
const next = require("next");

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

// Header bảo mật của Passenger (>= 5.0.21): khách không giả mạo được, vì Passenger từ chối mọi yêu cầu
// có header bắt đầu bằng "!~". Node chuyển tên header về chữ thường.
const PASSENGER_CLIENT = "!~passenger-client-address";
const INTERNAL = ["x-sura-client-ip", "x-sura-ip-source"];

// Nguồn IP theo cấu hình hosting (biến SURA_IP_SOURCE):
// - "inet-oneshield": hosting iNET (LiteSpeed + proxy OneShield). OneShield THAY THẾ X-Real-IP bằng IP thật của kết nối
//   (đã kiểm chứng: Wi-Fi/5G khác nhau, header giả mạo không đổi được kết quả). CHỈ tin X-Real-IP; không dùng header
//   Passenger, socket (luôn 127.0.0.1 dưới lsnode) hay X-Forwarded-For (phần tử cuối là IP proxy 103.57.*.*).
// - không đặt: cách cũ (Passenger / kết nối trực tiếp).
// - giá trị khác: không tin nguồn nào (an toàn).
const IP_SOURCE = String(process.env.SURA_IP_SOURCE || "").trim();

/** Chuẩn hoá một IP: bỏ tiền tố IPv4-mapped (::ffff:), phải là IP hợp lệ, loại loopback/không xác định. */
function normalizeIp(raw) {
  if (typeof raw !== "string") return null;
  const v = raw.trim().replace(/^::ffff:/i, "");
  if (!net.isIP(v)) return null;
  if (/^127\./.test(v) || v === "::1" || v === "0.0.0.0" || v === "::") return null;
  return v;
}

/**
 * IP thật của khách cho chatbot. Không xác định → chatbot không gọi AI (trừ chế độ thử), chuyển khách sang Zalo.
 * Không đặt SURA_IP_SOURCE: chỉ tin "!~Passenger-Client-Address" khi qua proxy nội bộ, hoặc địa chỉ socket khi kết nối thẳng.
 */
function clientIp(req) {
  if (IP_SOURCE === "coolify-traefik") {
    const peer = normalizeIp(req.socket.remoteAddress);
    const trusted = String(process.env.SURA_TRUSTED_PROXY_IPS || "")
      .split(",").map(normalizeIp).filter(Boolean);
    if (!peer || !trusted.includes(peer)) return null;
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded !== "string") return null;
    const ip = normalizeIp(forwarded.split(",").pop());
    return ip ? { ip, source: "coolify-traefik" } : null;
  }
  if (IP_SOURCE === "inet-oneshield") {
    // Header lặp lại bị Node gộp bằng dấu phẩy → không còn là IP hợp lệ → không xác định.
    const ip = normalizeIp(req.headers["x-real-ip"]);
    return ip ? { ip, source: "oneshield" } : null;
  }
  if (IP_SOURCE) return null;
  const sock = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  const viaLocalProxy = !sock || sock === "127.0.0.1" || sock === "::1";
  if (viaLocalProxy) {
    const p = String(req.headers[PASSENGER_CLIENT] || "").trim().replace(/^::ffff:/, "");
    return net.isIP(p) ? { ip: p, source: "passenger" } : null;
  }
  return net.isIP(sock) ? { ip: sock, source: "socket" } : null;
}

app.prepare()
  .then(() => {
    const server = http.createServer((req, res) => {
      for (const h of INTERNAL) delete req.headers[h];
      const found = clientIp(req);
      if (found) {
        req.headers["x-sura-client-ip"] = found.ip;
        req.headers["x-sura-ip-source"] = found.source;
      }
      Promise.resolve(handle(req, res)).catch((error) => {
        console.error(error);
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      });
    });

    server.on("error", (error) => {
      console.error(error);
      process.exit(1);
    });

    server.listen(process.env.PORT || 3000);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
