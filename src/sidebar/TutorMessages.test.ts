// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TutorMessages } from "./TutorMessages";
import type { TutorMessage } from "../tutor/types";

afterEach(cleanup);

const noop = () => {};

function assistant(overrides: Partial<TutorMessage> = {}): TutorMessage {
  return {
    id: "a1",
    role: "assistant",
    content: "",
    createdAt: 0,
    status: "complete",
    errorMessage: null,
    request: null,
    finishReason: "stop",
    continuationOf: null,
    savedPageNoteId: null,
    ...overrides,
  };
}

function user(overrides: Partial<TutorMessage> = {}): TutorMessage {
  return {
    id: "u1",
    role: "user",
    content: "Q",
    createdAt: 0,
    status: "complete",
    errorMessage: null,
    request: null,
    ...overrides,
  };
}

function renderMessages(
  messages: TutorMessage[],
  handlers: {
    running?: boolean;
    onRetry?: (id: string) => void;
    onContinue?: (id: string) => void;
    onSave?: (id: string) => void;
  } = {},
) {
  return render(
    createElement(TutorMessages, {
      messages,
      running: handlers.running ?? false,
      onRetry: handlers.onRetry ?? noop,
      onContinue: handlers.onContinue ?? noop,
      onSave: handlers.onSave ?? noop,
    }),
  );
}

describe("TutorMessages", () => {
  it("renders assistant Markdown as formatted content", () => {
    renderMessages([assistant({ content: "# Title\n\n**bold**" })]);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Title");
    expect(screen.getByText("bold").tagName).toBe("STRONG");
  });

  it("renders user messages as plain text (not Markdown)", () => {
    renderMessages([user({ content: "# not a heading" })]);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("# not a heading")).toBeTruthy();
  });

  it("marks a length-truncated answer and only continues on explicit click", () => {
    const onContinue = vi.fn();
    renderMessages([assistant({ content: "partial", finishReason: "length" })], {
      onContinue,
    });
    expect(screen.getByText("回答因长度限制被截断")).toBeTruthy();
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledWith("a1");
  });

  it("does not mark a stop-finished answer as truncated", () => {
    renderMessages([assistant({ content: "done", finishReason: "stop" })]);
    expect(screen.queryByText("回答因长度限制被截断")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("offers Save to Page Note and then shows the saved marker", () => {
    const onSave = vi.fn();
    const { rerender } = renderMessages([assistant({ content: "answer" })], { onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save to Page Note" }));
    expect(onSave).toHaveBeenCalledWith("a1");

    rerender(
      createElement(TutorMessages, {
        messages: [assistant({ content: "answer", savedPageNoteId: "note-1" })],
        running: false,
        onRetry: noop,
        onContinue: noop,
        onSave,
      }),
    );
    expect(screen.getByText("Saved to Notes ✓")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save to Page Note" })).toBeNull();
  });
});
