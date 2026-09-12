/**
 * Minimal per-annotation serialized persistence queue.
 *
 * Guarantees for each annotation id:
 *  - optimistic edits coalesce to the newest pending state;
 *  - at most one DB update is in flight at a time;
 *  - a completed write persists any still-pending newest state next;
 *  - deletion tombstones the id so no pending/stale write can resurrect it.
 *
 * The timers are injectable so the queue is unit-testable without the DOM.
 */

type Patch = Record<string, unknown>;

interface Writer {
  inFlight: boolean;
  pending: Patch | null;
  deleted: boolean;
}

export interface WriteQueueOptions {
  debounceMs?: number;
  persist: (id: string, patch: Patch) => Promise<void>;
  setTimeoutFn?: (fn: () => void, ms: number) => number;
  clearTimeoutFn?: (id: number) => void;
}

export interface WriteQueue {
  schedule: (id: string, patch: Patch) => void;
  markDeleted: (id: string) => void;
  flushAll: () => void;
}

export function createWriteQueue(options: WriteQueueOptions): WriteQueue {
  const debounceMs = options.debounceMs ?? 400;
  const setTimeoutFn =
    options.setTimeoutFn ?? ((fn: () => void, ms: number) => window.setTimeout(fn, ms));
  const clearTimeoutFn =
    options.clearTimeoutFn ?? ((id: number) => window.clearTimeout(id));

  const writers = new Map<string, Writer>();
  const timers = new Map<string, number>();

  async function flush(id: string): Promise<void> {
    const timer = timers.get(id);
    if (timer != null) {
      clearTimeoutFn(timer);
      timers.delete(id);
    }

    const writer = writers.get(id);
    if (!writer || writer.deleted || writer.inFlight) return;

    const patch = writer.pending;
    if (!patch) return;

    writer.pending = null;
    writer.inFlight = true;
    try {
      await options.persist(id, patch);
    } finally {
      writer.inFlight = false;
    }

    if (writer.deleted) return;
    if (writer.pending) {
      await flush(id);
    } else if (!writer.inFlight) {
      writers.delete(id);
    }
  }

  function schedule(id: string, patch: Patch): void {
    let writer = writers.get(id);
    if (!writer) {
      writer = { inFlight: false, pending: null, deleted: false };
      writers.set(id, writer);
    }
    if (writer.deleted) return;
    writer.pending = { ...writer.pending, ...patch };

    const existing = timers.get(id);
    if (existing != null) clearTimeoutFn(existing);
    const timer = setTimeoutFn(() => {
      timers.delete(id);
      void flush(id);
    }, debounceMs);
    timers.set(id, timer);
  }

  function markDeleted(id: string): void {
    const writer = writers.get(id);
    if (writer) {
      writer.deleted = true;
      writer.pending = null;
    } else {
      writers.set(id, { inFlight: false, pending: null, deleted: true });
    }
    const timer = timers.get(id);
    if (timer != null) {
      clearTimeoutFn(timer);
      timers.delete(id);
    }
  }

  function flushAll(): void {
    for (const id of [...writers.keys()]) {
      void flush(id);
    }
  }

  return { schedule, markDeleted, flushAll };
}
