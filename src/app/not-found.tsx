import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="text-5xl font-bold text-neutral-200">404</p>
      <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
      <p className="text-sm text-neutral-500">
        Trang bạn tìm có thể đã bị xóa hoặc đường dẫn không đúng.
      </p>
      <Link
        href="/"
        className="inline-flex h-11 items-center rounded-full bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-800"
      >
        Về trang chủ
      </Link>
    </div>
  );
}
