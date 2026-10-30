"use client";

import { useActionState } from "react";
import { Trash } from "lucide-react";
import { deleteCategoryAction, type FormState } from "../../catalog-actions";

export function DeleteCategoryButton({ id, name, disabled }: { id: number; name: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteCategoryAction, {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Xoá danh mục “${name}”? Thao tác này không hoàn tác được.`)) e.preventDefault();
      }}
      className="contents"
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={disabled || pending}
        className="inline-flex size-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-600 hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-30"
        aria-label={`Xoá ${name}`}
        title={disabled ? "Không thể xoá: còn sản phẩm hoặc danh mục con" : "Xoá"}
      >
        <Trash className="size-4" aria-hidden />
      </button>
      {state.message && (
        <span role="alert" className="basis-full text-right text-xs text-brand-700">
          {state.message}
        </span>
      )}
    </form>
  );
}
