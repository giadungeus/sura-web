"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductPhoto } from "@/types";

export function ProductGallery({ photos, name }: { photos: ProductPhoto[]; name: string }) {
  const [index, setIndex] = useState(0);
  const current = photos[Math.min(index, photos.length - 1)];

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-neutral-50">
        <Image
          src={current.url}
          alt={name}
          fill
          unoptimized
          priority
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-contain"
        />
      </div>
      {photos.length > 1 && (
        <ul className="no-scrollbar flex gap-2 overflow-x-auto" aria-label="Ảnh sản phẩm">
          {photos.map((photo, i) => (
            <li key={photo.url} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Xem ảnh ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={`relative block size-16 overflow-hidden rounded-xl border-2 bg-neutral-50 sm:size-20 ${
                  i === index ? "border-neutral-900" : "border-transparent hover:border-neutral-300"
                }`}
              >
                <Image src={photo.url} alt="" fill unoptimized sizes="80px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
