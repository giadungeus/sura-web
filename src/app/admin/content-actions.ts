"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH, getAdminSession } from "@/lib/server/admin-auth";
import { pageBySlug } from "@/lib/content/pages";
import { imageMarkup, saveContentImage } from "@/lib/server/content-images";
import { ImageRejectedError, MAX_UPLOAD_BYTES } from "@/lib/server/images";
import { saveContentPage, saveNews, saveSiteSettings, type ContentIntent, type NewsIntent } from "@/lib/server/site-content";

/** Mọi thao tác quản trị đều kiểm tra lại phiên; hết phiên thì về trang đăng nhập. */
async function requireAdmin(returnTo: string) {
  const session = await getAdminSession();
  if (!session) redirect(`${ADMIN_LOGIN_PATH}?het-han=1&tiep=${encodeURIComponent(returnTo)}`);
  return session;
}

export type ContentFormState = { ok?: boolean; message?: string; fieldErrors?: Record<string, string>; at?: number };

const field = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

// ───────────── Cài đặt website ─────────────

export async function saveSettingsAction(_prev: ContentFormState, formData: FormData): Promise<ContentFormState> {
  const session = await requireAdmin("/admin/cai-dat");
  const result = saveSiteSettings(Object.fromEntries(formData), session.username);
  if (!result.ok) return { ok: false, message: "Vui lòng kiểm tra lại các ô báo lỗi.", fieldErrors: result.errors, at: Date.now() };
  refresh();
  return { ok: true, message: "Đã lưu. Website đã cập nhật thông tin mới.", at: Date.now() };
}

// ───────────── Ảnh trong bài (nút “Chèn ảnh” của trình soạn thảo) ─────────────

export type ContentImageResult = { ok: true; markup: string; note?: string } | { ok: false; message: string };

export async function uploadContentImageAction(formData: FormData): Promise<ContentImageResult> {
  const session = await getAdminSession();
  if (!session) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
  const file = formData.get("file");
  const alt = field(formData, "alt").replace(/\s+/g, " ").trim().slice(0, 200);
  const caption = field(formData, "caption").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Chưa chọn ảnh." };
  if (!alt) return { ok: false, message: "Vui lòng nhập văn bản thay thế (mô tả ảnh)." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "Ảnh vượt quá 5 MB." };
  try {
    const img = await saveContentImage(Buffer.from(await file.arrayBuffer()), "bai", session.username);
    return {
      ok: true,
      markup: imageMarkup(img, alt, caption),
      note: img.overTarget ? `Ảnh ${Math.round(img.sizeBytes / 1024)} KB — lớn hơn mục tiêu 250 KB nhưng vẫn trong giới hạn 500 KB.` : undefined,
    };
  } catch (error) {
    if (error instanceof ImageRejectedError) return { ok: false, message: error.message };
    console.error("[admin] Lỗi tải ảnh nội dung:", error instanceof Error ? error.message : error);
    return { ok: false, message: "Không lưu được ảnh do lỗi hệ thống." };
  }
}

// ───────────── Trang nội dung ─────────────

const PAGE_INTENTS: ContentIntent[] = ["draft", "publish", "unpublish", "discard"];

export async function savePageAction(_prev: ContentFormState, formData: FormData): Promise<ContentFormState> {
  const slug = field(formData, "slug");
  const session = await requireAdmin(pageBySlug(slug) ? `/admin/noi-dung/${slug}` : "/admin/noi-dung");
  const intent = field(formData, "intent") as ContentIntent;
  if (!pageBySlug(slug) || !PAGE_INTENTS.includes(intent)) return { ok: false, message: "Yêu cầu không hợp lệ.", at: Date.now() };
  const result = saveContentPage(
    slug,
    { title: formData.get("title"), body: formData.get("body"), seoTitle: formData.get("seoTitle"), seoDescription: formData.get("seoDescription") },
    intent,
    session.username,
  );
  if (result.ok) refresh();
  return { ...result, at: Date.now() };
}

// ───────────── Tin tức ─────────────

const NEWS_INTENTS: NewsIntent[] = ["draft", "publish", "hide", "discard"];

export async function saveNewsAction(_prev: ContentFormState, formData: FormData): Promise<ContentFormState> {
  const idRaw = field(formData, "id");
  const id = /^\d{1,9}$/.test(idRaw) ? Number(idRaw) : null;
  const session = await requireAdmin(id ? `/admin/tin-tuc/${id}` : "/admin/tin-tuc/moi");
  const intent = field(formData, "intent") as NewsIntent;
  if (!NEWS_INTENTS.includes(intent)) return { ok: false, message: "Yêu cầu không hợp lệ.", at: Date.now() };
  const result = saveNews(
    id,
    {
      title: formData.get("title"),
      slug: formData.get("slug"),
      summary: formData.get("summary"),
      body: formData.get("body"),
      coverFile: formData.get("coverFile"),
      coverAlt: formData.get("coverAlt"),
      seoTitle: formData.get("seoTitle"),
      seoDescription: formData.get("seoDescription"),
    },
    intent,
    session.username,
  );
  if (!result.ok) return { ...result, at: Date.now() };
  // Bài mới: chuyển sang trang sửa của bài vừa tạo.
  if (!id) redirect(`/admin/tin-tuc/${result.id}?da-luu=1`);
  refresh();
  return { ok: true, message: result.message, at: Date.now() };
}
