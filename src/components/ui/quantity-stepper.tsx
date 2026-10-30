"use client";

import { Minus, Plus } from "lucide-react";

export function QuantityStepper({
  value,
  max,
  onChange,
  size = "md",
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  size?: "sm" | "md";
}) {
  const btn =
    size === "sm"
      ? "size-8"
      : "size-10";
  return (
    <div className="inline-flex items-center rounded-full border border-neutral-200">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
        className={`${btn} inline-flex items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-300 disabled:hover:bg-transparent`}
        aria-label="Giảm số lượng"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          if (Number.isFinite(n)) onChange(Math.max(1, Math.min(n, max)));
        }}
        className="w-10 [appearance:textfield] bg-transparent text-center text-sm font-medium outline-none [&::-webkit-inner-spin-button]:appearance-none"
        aria-label="Số lượng"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className={`${btn} inline-flex items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-300 disabled:hover:bg-transparent`}
        aria-label="Tăng số lượng"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
