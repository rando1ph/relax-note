import { describe, expect, it } from "vitest";
import inspectorSource from "./VocabularyInspector.tsx?raw";
import panelSource from "./VocabularyPanel.tsx?raw";

describe("vocabulary inspector source", () => {
  it("no longer renders English definition or contextual explanation", () => {
    expect(inspectorSource).not.toContain("definitionEn");
    expect(inspectorSource).not.toContain("contextualExplanation");
    expect(inspectorSource).not.toContain("English definition");
    expect(inspectorSource).not.toContain("Contextual explanation");
  });

  it("keeps a sticky action bar with the primary action and Delete", () => {
    expect(inspectorSource).toContain("vocab-action-bar");
    expect(inspectorSource).toContain("Delete");
  });
});

describe("vocabulary panel layout", () => {
  it("separates the list region and inspector region with a divider", () => {
    expect(panelSource).toContain("vocab-list-region");
    expect(panelSource).toContain("vocab-divider");
    expect(panelSource).toContain("VocabularyInspector");
  });
});
