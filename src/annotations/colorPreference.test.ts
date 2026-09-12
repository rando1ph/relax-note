import { describe, expect, it } from "vitest";
import {
  loadLastUsedColor,
  saveLastUsedColor,
  LAST_USED_COLOR_KEY,
} from "./colorPreference";
import { DEFAULT_ANNOTATION_COLOR } from "./palette";

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("last-used annotation color preference", () => {
  it("falls back to Yellow when nothing is stored", () => {
    expect(loadLastUsedColor(fakeStorage())).toBe(DEFAULT_ANNOTATION_COLOR);
    expect(DEFAULT_ANNOTATION_COLOR).toBe("#FFD400");
  });

  it("restores a valid stored palette color", () => {
    expect(loadLastUsedColor(fakeStorage({ [LAST_USED_COLOR_KEY]: "#0A84FF" }))).toBe(
      "#0A84FF",
    );
  });

  it("safely falls back for invalid/obsolete stored values", () => {
    expect(loadLastUsedColor(fakeStorage({ [LAST_USED_COLOR_KEY]: "#123456" }))).toBe(
      DEFAULT_ANNOTATION_COLOR,
    );
    expect(loadLastUsedColor(fakeStorage({ [LAST_USED_COLOR_KEY]: "not-a-color" }))).toBe(
      DEFAULT_ANNOTATION_COLOR,
    );
  });

  it("saves valid colors and ignores non-palette values", () => {
    const storage = fakeStorage();
    saveLastUsedColor("#34C759", storage);
    expect(storage.getItem(LAST_USED_COLOR_KEY)).toBe("#34C759");
    saveLastUsedColor("#123456", storage);
    expect(storage.getItem(LAST_USED_COLOR_KEY)).toBe("#34C759");
  });

  it("handles missing storage safely", () => {
    expect(loadLastUsedColor(null)).toBe(DEFAULT_ANNOTATION_COLOR);
    expect(() => saveLastUsedColor("#FFD400", null)).not.toThrow();
  });
});
