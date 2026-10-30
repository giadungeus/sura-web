/**
 * Thiết lập tài khoản quản trị (chạy trên máy):
 *
 *   npm run admin:setup            Tạo hoặc đặt lại tài khoản (hỏi tên + mật khẩu, nhập ẩn)
 *   npm run admin:setup -- --xoa   Xoá tài khoản quản trị và mọi phiên đăng nhập
 *
 * Hệ thống chỉ có MỘT quản trị viên: chạy lại lệnh sẽ thay tài khoản cũ và đăng xuất mọi phiên.
 * Mật khẩu chỉ được lưu dưới dạng băm (scrypt) trong CSDL `.data/shop.sqlite`.
 *
 * Chạy tự động (không khuyến khích vì mật khẩu nằm trong biến môi trường):
 *   đặt ADMIN_USERNAME và ADMIN_PASSWORD trước khi chạy.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { DatabaseSync } from "node:sqlite";
import {
  USERNAME_PATTERN,
  checkPasswordPolicy,
  hashPassword,
} from "../src/lib/server/password.ts";
import { configure, migrate } from "../src/lib/server/schema.ts";

const dbPath = process.env.SHOP_DB_PATH || path.join(process.cwd(), ".data", "shop.sqlite");

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Không in ký tự mật khẩu ra màn hình.
      const internal = rl as unknown as { _writeToOutput: (text: string) => void; output: NodeJS.WriteStream };
      internal._writeToOutput = (text: string) => {
        if (text.includes(question) || text === "\r\n" || text === "\n") internal.output.write(text);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function openDb(): DatabaseSync {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  configure(db);
  migrate(db);
  return db;
}

async function main() {
  const db = openDb();
  console.log(`CSDL: ${dbPath}`);

  if (process.argv.includes("--xoa")) {
    db.exec("BEGIN IMMEDIATE");
    db.exec("DELETE FROM admin_sessions; DELETE FROM admins; DELETE FROM login_attempts;");
    db.exec("COMMIT");
    console.log("✓ Đã xoá tài khoản quản trị và mọi phiên đăng nhập. Đơn hàng không bị ảnh hưởng.");
    return;
  }

  const existing = db.prepare("SELECT username FROM admins LIMIT 1").get() as { username: string } | undefined;
  if (existing) console.log(`Tài khoản hiện tại: ${existing.username} (sẽ được thay bằng tài khoản mới).`);

  let username = process.env.ADMIN_USERNAME?.trim() ?? "";
  let password = process.env.ADMIN_PASSWORD ?? "";
  const interactive = !username || !password;

  if (interactive) {
    if (!process.stdin.isTTY) {
      fail("Hãy chạy lệnh này trong cửa sổ terminal (PowerShell) để nhập mật khẩu.");
    }
    username = (await ask("Tên đăng nhập (3–32 ký tự: chữ, số, . _ -) [admin]: ")).trim() || "admin";
  }
  if (!USERNAME_PATTERN.test(username)) fail("Tên đăng nhập chỉ gồm 3–32 ký tự chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.");

  if (interactive) {
    password = await ask("Mật khẩu (ít nhất 10 ký tự, không hiện khi gõ): ", true);
    const policyError = checkPasswordPolicy(password, username);
    if (policyError) fail(policyError);
    const confirm = await ask("Nhập lại mật khẩu: ", true);
    if (confirm !== password) fail("Hai lần nhập mật khẩu không khớp.");
  } else {
    const policyError = checkPasswordPolicy(password, username);
    if (policyError) fail(policyError);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    // Chỉ một quản trị viên: thay tài khoản cũ, đăng xuất mọi phiên.
    db.exec("DELETE FROM admin_sessions; DELETE FROM admins; DELETE FROM login_attempts;");
    db.prepare("INSERT INTO admins (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      username,
      passwordHash,
      now,
      now,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  console.log(`✓ Đã thiết lập tài khoản quản trị “${username}”. Đăng nhập tại http://localhost:3000/admin`);
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
