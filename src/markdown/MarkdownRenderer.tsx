import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ComponentPropsWithoutRef } from "react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

function isSafeExternalHref(href: string | undefined): href is string {
  if (!href) return false;
  return /^(https?:|mailto:|tel:)/i.test(href);
}

/**
 * Shared, safe Markdown renderer for AI Tutor answers and user Notes.
 *
 * Security: `rehype-raw` is intentionally NOT used, so raw HTML in Markdown is
 * never turned into DOM. react-markdown sanitizes link/image URLs by default.
 * External links are handed to the OS opener (the WebView must never navigate).
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={className ? `markdown-body ${className}` : "markdown-body"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...rest }: ComponentPropsWithoutRef<"a">) => (
            <a
              {...rest}
              href={href}
              onClick={(event) => {
                event.preventDefault();
                if (isSafeExternalHref(href)) {
                  void openUrl(href).catch(() => undefined);
                }
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
