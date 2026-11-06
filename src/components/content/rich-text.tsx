import Link from "next/link";
import { applyVariables, parseMarkup, type Inline } from "@/lib/content/markup";

/**
 * Hiển thị nội dung soạn trong quản trị. Chỉ dựng phần tử React (không dùng HTML thô),
 * nên nội dung nhập vào không thể chạy mã. Liên kết không an toàn hoặc trỏ tới trang
 * chưa công khai được hiện như chữ thường.
 */
export function RichText({
  source,
  vars = {},
  hiddenPaths = [],
}: {
  source: string;
  vars?: Record<string, string>;
  hiddenPaths?: readonly string[];
}) {
  const blocks = parseMarkup(applyVariables(source, vars));
  const isHidden = (href: string) => hiddenPaths.some((p) => href === p || href.startsWith(p + "#") || href.startsWith(p + "?"));

  const renderInline = (nodes: Inline[], keyPrefix: string): React.ReactNode[] =>
    nodes.map((n, i) => {
      const key = `${keyPrefix}-${i}`;
      if (n.type === "text") return n.text;
      if (n.type === "strong") return <strong key={key}>{renderInline(n.children, key)}</strong>;
      const children = renderInline(n.children, key);
      if (!n.href || isHidden(n.href)) return <span key={key}>{children}</span>;
      if (n.href.startsWith("/") || n.href.startsWith("#"))
        return (
          <Link key={key} href={n.href}>
            {children}
          </Link>
        );
      const external = /^https?:/.test(n.href);
      return (
        <a key={key} href={n.href} {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
          {children}
        </a>
      );
    });

  return (
    <div className="prose-info">
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.type) {
          case "h2":
            return (
              <h2 key={key} id={b.id || undefined} className="scroll-mt-32">
                {renderInline(b.children, key)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={key} id={b.id || undefined} className="scroll-mt-32">
                {renderInline(b.children, key)}
              </h3>
            );
          case "img":
            // Ảnh trong bài nằm dưới phần đầu trang → tải khi cuộn gần tới (lazy); có kích thước để không giật bố cục.
            return b.src ? (
              <figure key={key}>
                {/* eslint-disable-next-line @next/next/no-img-element -- ảnh đã tối ưu WebP, phục vụ qua /anh */}
                <img
                  src={b.src}
                  alt={b.alt}
                  width={b.width ?? undefined}
                  height={b.height ?? undefined}
                  loading="lazy"
                  decoding="async"
                />
                {b.caption && <figcaption>{b.caption}</figcaption>}
              </figure>
            ) : (
              <p key={key} className="text-sm text-neutral-500 italic">
                [Ảnh: {b.alt || "không hiển thị được"}]
              </p>
            );
          case "table":
            return (
              <div key={key} className="table-wrap" role="region" aria-label="Bảng" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      {b.header.map((cell, c) => (
                        <th key={c} scope="col">
                          {renderInline(cell, `${key}-h${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c}>{renderInline(cell, `${key}-${r}-${c}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "ul":
          case "ol": {
            const Tag = b.type;
            return (
              <Tag key={key}>
                {b.items.map((item, j) => (
                  <li key={j}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </Tag>
            );
          }
          default:
            return (
              <p key={key}>
                {b.lines.map((line, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {renderInline(line, `${key}-${j}`)}
                  </span>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}
