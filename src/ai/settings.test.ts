import { describe, expect, it } from "vitest";
import { resolveAiSettings } from "./settings";

describe("resolveAiSettings", () => {
  it("C: defaults autoEnrich to true when the setting is absent", () => {
    const settings = resolveAiSettings({
      baseUrl: null,
      model: null,
      autoEnrich: null,
      jsonMode: null,
    });
    expect(settings.autoEnrich).toBe(true);
    expect(settings.jsonMode).toBe(false);
  });

  it("D: a persisted false restores false", () => {
    const settings = resolveAiSettings({
      baseUrl: "https://host/v1",
      model: "m",
      autoEnrich: "0",
      jsonMode: "1",
    });
    expect(settings.autoEnrich).toBe(false);
    expect(settings.jsonMode).toBe(true);
  });

  it("a persisted true restores true", () => {
    const settings = resolveAiSettings({
      baseUrl: "https://host/v1",
      model: "m",
      autoEnrich: "1",
      jsonMode: "0",
    });
    expect(settings.autoEnrich).toBe(true);
    expect(settings.jsonMode).toBe(false);
  });
});
