import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/server/admin-auth";
import { getPreviewContext } from "@/lib/server/site-content";
import { listAdminCategories } from "@/lib/server/admin-catalog";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Thêm sản phẩm" };

export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/admin/san-pham" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="size-4" aria-hidden /> Sản phẩm
      </Link>
      <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Thêm sản phẩm</h1>
      <Suspense fallback={<div className="h-[40rem] animate-pulse rounded-2xl bg-neutral-200" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await requireAdmin("/admin/san-pham/moi");
  const categories = listAdminCategories().map((c) => ({ id: c.id, name: c.name, depth: c.depth }));
  const { vars, hiddenPaths } = getPreviewContext();
  return (
    <ProductForm
      categories={categories}
      vars={vars}
      hiddenPaths={hiddenPaths}
      initial={{
        id: null,
        name: "",
        slug: "",
        categoryId: null,
        brand: "",
        shortDescription: "",
        description: "",
        highlights: [],
        isVisible: true,
        optionNames: [],
        variants: [],
        images: [],
        primaryImageId: null,
        orderCount: 0,
        seoTitle: "",
        seoDescription: "",
        everPublic: false,
        videos: [],
      }}
    />
  );
}
