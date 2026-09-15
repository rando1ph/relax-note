import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownRenderer } from "./MarkdownRenderer";

function render(content: string): string {
  return renderToStaticMarkup(createElement(MarkdownRenderer, { content }));
}

describe("MarkdownRenderer", () => {
  it("renders headings, bold and italic", () => {
    const html = render("# Title\n\n**bold** and *italic*");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders GFM tables and task lists", () => {
    const table = render("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(table).toContain("<table>");
    expect(table).toContain("<th>a</th>");
    const tasks = render("- [x] done\n- [ ] todo");
    expect(tasks).toContain('type="checkbox"');
  });

  it("does not render raw HTML (no rehype-raw)", () => {
    const html = render('<script>alert("x")</script>\n\n<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    // The dangerous markup is surfaced as inert text instead.
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders links as anchors", () => {
    const html = render("[link](https://example.com)");
    expect(html).toContain('href="https://example.com"');
  });
});
