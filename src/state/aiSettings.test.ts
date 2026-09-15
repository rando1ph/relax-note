import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { isAiConfigured } from "../ai/settings";
import { AiSettingsProvider, useAiSettings } from "./aiSettings";

function Probe() {
  const { configured, settings } = useAiSettings();
  return createElement("span", null, `${String(configured)}:${settings.model}`);
}

describe("AiSettingsProvider", () => {
  it("provides a single shared settings source to consumers", () => {
    const html = renderToString(
      createElement(AiSettingsProvider, null, createElement(Probe)),
    );
    // Default settings (empty base URL/model) → configured is false.
    expect(html).toContain("false:");
  });

  it("derives configured from the shared isAiConfigured helper", () => {
    expect(
      isAiConfigured({ baseUrl: "", model: "", autoEnrich: true, jsonMode: false }),
    ).toBe(false);
    expect(
      isAiConfigured({ baseUrl: "https://host/v1", model: "m", autoEnrich: true, jsonMode: false }),
    ).toBe(true);
  });
});
