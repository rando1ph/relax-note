import { describe, expect, it } from "vitest";
import { createWriteQueue } from "./writeQueue";

function makeClock() {
  let nextId = 1;
  const timers = new Map<number, () => void>();
  return {
    setTimeoutFn(fn: () => void, _ms: number) {
      const id = nextId++;
      timers.set(id, fn);
      return id;
    },
    clearTimeoutFn(id: number) {
      timers.delete(id);
    },
    runAll() {
      const fns = [...timers.values()];
      timers.clear();
      for (const fn of fns) fn();
    },
  };
}

function makeQueue(calls: { id: string; patch: Record<string, unknown> }[]) {
  const clock = makeClock();
  const queue = createWriteQueue({
    debounceMs: 400,
    persist: async (id, patch) => {
      calls.push({ id, patch });
    },
    setTimeoutFn: clock.setTimeoutFn,
    clearTimeoutFn: clock.clearTimeoutFn,
  });
  return { queue, clock };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("writeQueue", () => {
  it("coalesces rapid edits into the newest state", async () => {
    const calls: { id: string; patch: Record<string, unknown> }[] = [];
    const { queue, clock } = makeQueue(calls);

    queue.schedule("a", { note: "first" });
    queue.schedule("a", { note: "second" });
    clock.runAll();
    await tick();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ id: "a", patch: { note: "second" } });
  });

  it("delete cancels a pending write", async () => {
    const calls: { id: string; patch: Record<string, unknown> }[] = [];
    const { queue, clock } = makeQueue(calls);

    queue.schedule("a", { note: "x" });
    queue.markDeleted("a");
    clock.runAll();
    await tick();

    expect(calls).toHaveLength(0);
  });

  it("delete prevents future writes", async () => {
    const calls: { id: string; patch: Record<string, unknown> }[] = [];
    const { queue, clock } = makeQueue(calls);

    queue.markDeleted("a");
    queue.schedule("a", { note: "x" });
    clock.runAll();
    await tick();

    expect(calls).toHaveLength(0);
  });

  it("never overlaps writes for the same id (serialized)", async () => {
    const calls: { id: string; patch: Record<string, unknown> }[] = [];
    const clock = makeClock();

    let concurrent = 0;
    let maxConcurrent = 0;
    let callCount = 0;
    const resolvers: (() => void)[] = [];

    const queue = createWriteQueue({
      debounceMs: 400,
      persist: async (id, patch) => {
        callCount++;
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        calls.push({ id, patch });
        await new Promise<void>((resolve) => resolvers.push(resolve));
        concurrent--;
      },
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
    });

    queue.schedule("a", { note: "1" });
    clock.runAll(); // start write #1 (in-flight)
    queue.schedule("a", { note: "2" }); // coalesce while #1 is in flight

    resolvers[0](); // complete #1
    await tick();
    expect(maxConcurrent).toBe(1);
    expect(callCount).toBe(2); // #2 started only after #1 completed

    resolvers[1](); // complete #2
    await tick();
    expect(maxConcurrent).toBe(1);
    expect(calls.map((c) => c.patch.note)).toEqual(["1", "2"]);
  });
});
