import type { ReactNode } from "react";
import { parseMarkdown, type Inline } from "@/lib/chat-markdown";

function renderInline(nodes: Inline[], key = "i"): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}-${i}`;
    switch (n.t) {
      case "text":
        return n.v;
      case "b":
        return <strong key={k}>{renderInline(n.c, k)}</strong>;
      case "code":
        return (
          <code key={k} className="rounded bg-neutral-200/70 px-1 py-0.5 text-[0.85em] break-all">
            {n.v}
          </code>
        );
      case "link": {
        const external = !n.href.startsWith("/");
        return (
          <a
            key={k}
            href={n.href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
            className="break-words text-sky-700 underline underline-offset-2"
          >
            {renderInline(n.c, k)}
          </a>
        );
      }
    }
  });
}

/**
 * Hiển thị câu trả lời Markdown an toàn: chỉ dựng phần tử React từ cây đã phân tích (không innerHTML, không chạy HTML).
 * Bảng nằm trong khung cuộn ngang riêng nên không làm tràn trang trên điện thoại.
 */
export function ChatMarkdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-2 break-words">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p":
            return (
              <p key={i}>
                {b.lines.map((l, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {renderInline(l, `p${i}-${j}`)}
                  </span>
                ))}
              </p>
            );
          case "h":
            return (
              <p key={i} className="pt-1 font-semibold">
                {renderInline(b.c, `h${i}`)}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `u${i}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} start={b.start} className="list-decimal space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `o${i}-${j}`)}</li>
                ))}
              </ol>
            );
          case "table":
            return (
              <div key={i} className="max-w-full overflow-x-auto rounded-lg border border-neutral-200 bg-white" role="region" aria-label="Bảng so sánh" tabIndex={0}>
                <table className="min-w-full border-collapse text-xs">
                  <thead className="bg-neutral-50">
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j} className="border-b border-neutral-200 px-2 py-1.5 text-left font-semibold whitespace-nowrap">
                          {renderInline(c, `th${i}-${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="align-top odd:bg-white even:bg-neutral-50/60">
                        {r.map((c, k) => (
                          <td key={k} className="min-w-24 border-b border-neutral-100 px-2 py-1.5">
                            {renderInline(c, `td${i}-${j}-${k}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
