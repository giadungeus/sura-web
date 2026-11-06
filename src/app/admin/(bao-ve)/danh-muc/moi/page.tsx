import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/server/admin-auth";
import { listAdminCategories } from "@/lib/server/admin-catalog";
import { CategoryForm } from "../category-form";

export const metadata: Metadata = { title: "Thêm danh mục" };

export default function NewCategoryPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/admin/danh-muc" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="size-4" aria-hidden /> Danh mục
      </Link>
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Thêm danh mục</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-neutral-200" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireAdmin("/admin/danh-muc/moi");
  const parents = listAdminCategories().map((c) => ({ id: c.id, name: c.name, depth: c.depth }));
  return (
    <CategoryForm
      parents={parents}
      initial={{
        id: null,
        name: "",
        slug: "",
        description: "",
        icon: "shopping-bag",
        parentId: null,
        sortOrder: 0,
        isVisible: true,
        everPublic: false,
      }}
    />
  );
}
