import { describe, expect, it } from "vitest";
import { createRequestGate } from "./requestGate";

describe("requestGate", () => {
  it("only the newest generation for an id is current (A then B)", () => {
    const gate = createRequestGate();
    const a = gate.begin("x");
    const b = gate.begin("x");
    expect(gate.isCurrent(a)).toBe(false);
    expect(gate.isCurrent(b)).toBe(true);
  });

  it("rapid double regenerate keeps only the newest", () => {
    const gate = createRequestGate();
    gate.begin("x");
    const second = gate.begin("x");
    const third = gate.begin("x");
    expect(gate.isCurrent(second)).toBe(false);
    expect(gate.isCurrent(third)).toBe(true);
  });

  it("a tombstoned id never becomes current (delete during request)", () => {
    const gate = createRequestGate();
    const token = gate.begin("x");
    gate.tombstone("x");
    expect(gate.isCurrent(token)).toBe(false);
    expect(gate.isTombstoned("x")).toBe(true);
  });

  it("invalidating makes the previous token stale", () => {
    const gate = createRequestGate();
    const token = gate.begin("x");
    gate.invalidate("x");
    expect(gate.isCurrent(token)).toBe(false);
  });

  it("an epoch change drops all prior tokens (document switch)", () => {
    const gate = createRequestGate();
    const a = gate.begin("x");
    const b = gate.begin("y");
    gate.bumpEpoch();
    expect(gate.isCurrent(a)).toBe(false);
    expect(gate.isCurrent(b)).toBe(false);
  });

  it("tracks ids independently", () => {
    const gate = createRequestGate();
    const a = gate.begin("x");
    const b = gate.begin("y");
    expect(gate.isCurrent(a)).toBe(true);
    expect(gate.isCurrent(b)).toBe(true);
  });
});
