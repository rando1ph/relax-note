// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NoteEditor } from "./NoteEditor";

afterEach(cleanup);

describe("NoteEditor", () => {
  it("keeps canonical Markdown as raw plain text in the textarea", () => {
    render(
      createElement(NoteEditor, {
        value: "# Heading\n\n**bold**",
        onChange: () => {},
        onFlush: () => {},
      }),
    );
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("# Heading\n\n**bold**");
  });

  it("Edit ↔ Preview toggling renders Markdown but does not mutate content", () => {
    const onChange = vi.fn();
    const onFlush = vi.fn();
    render(createElement(NoteEditor, { value: "# Heading", onChange, onFlush }));

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Heading");
    // Entering preview flushes pending edits but never rewrites content.
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("# Heading");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not render raw HTML in preview", () => {
    render(
      createElement(NoteEditor, {
        value: '<img src=x onerror="alert(1)">',
        onChange: () => {},
        onFlush: () => {},
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(document.querySelector("img")).toBeNull();
  });
});
