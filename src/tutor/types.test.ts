import { describe, expect, it } from "vitest";
import { isTruncated } from "./types";
import type { TutorMessage } from "./types";

function message(overrides: Partial<TutorMessage>): TutorMessage {
  return {
    id: "m",
    role: "assistant",
    content: "x",
    createdAt: 0,
    status: "complete",
    errorMessage: null,
    request: null,
    ...overrides,
  };
}

describe("isTruncated", () => {
  it("is true only for a length finish reason", () => {
    expect(isTruncated(message({ finishReason: "length" }))).toBe(true);
    expect(isTruncated(message({ finishReason: "stop" }))).toBe(false);
    expect(isTruncated(message({ finishReason: "other" }))).toBe(false);
    expect(isTruncated(message({ finishReason: null }))).toBe(false);
    expect(isTruncated(message({ finishReason: undefined }))).toBe(false);
  });

  it("distinguishes output truncation from an input-limit request error", () => {
    // A Rust input-limit violation surfaces as an explicit request error, not a
    // silent mid-sentence completion.
    const errorMessage = message({
      status: "error",
      content: "",
      errorMessage: "Message payload is too large",
    });
    expect(isTruncated(errorMessage)).toBe(false);
  });

  it("is never true for a user message", () => {
    expect(isTruncated(message({ role: "user", finishReason: "length" }))).toBe(false);
  });
});
