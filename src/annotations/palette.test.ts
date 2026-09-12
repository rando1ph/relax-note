import { describe, expect, it } from "vitest";
import {
  ANNOTATION_PALETTE,
  DEFAULT_ANNOTATION_COLOR,
  isPaletteColor,
  paletteColorName,
} from "./palette";

describe("ANNOTATION_PALETTE", () => {
  it("has exactly 12 presets with unique values", () => {
    expect(ANNOTATION_PALETTE).toHaveLength(12);
    const values = ANNOTATION_PALETTE.map((p) => p.value.toLowerCase());
    expect(new Set(values).size).toBe(12);
  });

  it("has stable names and values in order", () => {
    expect(ANNOTATION_PALETTE.map((p) => [p.name, p.value])).toEqual([
      ["Yellow", "#FFD400"],
      ["Orange", "#FF9F0A"],
      ["Coral", "#FF6B5E"],
      ["Pink", "#FF6482"],
      ["Rose", "#D94F70"],
      ["Purple", "#AF52DE"],
      ["Indigo", "#5E5CE6"],
      ["Blue", "#0A84FF"],
      ["Cyan", "#32ADE6"],
      ["Teal", "#30B0C7"],
      ["Green", "#34C759"],
      ["Lime", "#9ACD32"],
    ]);
  });

  it("defaults to Yellow #FFD400", () => {
    expect(DEFAULT_ANNOTATION_COLOR).toBe("#FFD400");
    expect(ANNOTATION_PALETTE[0]).toEqual({ name: "Yellow", value: "#FFD400" });
  });

  it("identifies palette colors case-insensitively", () => {
    expect(isPaletteColor("#FFD400")).toBe(true);
    expect(isPaletteColor("#ffd400")).toBe(true);
    expect(isPaletteColor("#123456")).toBe(false);
    expect(isPaletteColor("garbage")).toBe(false);
  });

  it("resolves palette color names", () => {
    expect(paletteColorName("#0A84FF")).toBe("Blue");
    expect(paletteColorName("#123456")).toBeUndefined();
  });
});
