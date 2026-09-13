import { describe, expect, it } from "vitest";
import { shouldEnrich } from "./autoEnrich";

const configured = { configured: true, autoEnrich: true };
const configuredNoAuto = { configured: true, autoEnrich: false };
const unconfigured = { configured: false, autoEnrich: true };

describe("shouldEnrich", () => {
  it("E: configured + autoEnrich + create → true", () => {
    expect(shouldEnrich("create", configured)).toBe(true);
  });

  it("F: unconfigured + autoEnrich + create → false", () => {
    expect(shouldEnrich("create", unconfigured)).toBe(false);
  });

  it("G: configured + autoEnrich=false + create → false", () => {
    expect(shouldEnrich("create", configuredNoAuto)).toBe(false);
  });

  it("H: manual Generate → true when configured, false otherwise", () => {
    expect(shouldEnrich("manual", configured)).toBe(true);
    expect(shouldEnrich("manual", configuredNoAuto)).toBe(true);
    expect(shouldEnrich("manual", unconfigured)).toBe(false);
  });

  it("I: configuring AI never bulk-enriches historical items", () => {
    expect(shouldEnrich("settings-change", configured)).toBe(false);
    expect(shouldEnrich("settings-change", configuredNoAuto)).toBe(false);
    expect(shouldEnrich("settings-change", unconfigured)).toBe(false);
  });
});
