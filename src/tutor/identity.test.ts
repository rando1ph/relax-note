import { describe, expect, it } from "vitest";
import {
  annotationIdentity,
  contextIdentityKey,
  pageIdentity,
  pageNoteIdentity,
  selectionIdentity,
} from "./identity";

describe("Tutor context identity", () => {
  it("selection identity is stable for the same page/text (whitespace-normalized)", () => {
    const a = contextIdentityKey(selectionIdentity(304, "hello world"));
    const b = contextIdentityKey(selectionIdentity(304, "hello   world"));
    const c = contextIdentityKey(selectionIdentity(304, "different text"));
    const d = contextIdentityKey(selectionIdentity(305, "hello world"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    expect(a.startsWith("selection:304:")).toBe(true);
  });

  it("page, annotation and page-note keys are stable and distinct", () => {
    expect(contextIdentityKey(pageIdentity("doc", 7))).toBe("page:doc:7");
    expect(contextIdentityKey(annotationIdentity("a1"))).toBe("annotation:a1");
    expect(contextIdentityKey(pageNoteIdentity("p1"))).toBe("page-note:p1");
  });
});
