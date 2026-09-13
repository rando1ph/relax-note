/**
 * Per-annotation generation gate for async enrichment. Guarantees that only the
 * newest request for a live annotation may persist its result, regardless of
 * completion order, and that a deleted annotation can never be resurrected.
 */

export interface RequestToken {
  id: string;
  generation: number;
  epoch: number;
}

export interface RequestGate {
  begin(id: string): RequestToken;
  isCurrent(token: RequestToken): boolean;
  invalidate(id: string): void;
  tombstone(id: string): void;
  isTombstoned(id: string): boolean;
  bumpEpoch(): void;
  epoch(): number;
}

export function createRequestGate(): RequestGate {
  const generations = new Map<string, number>();
  const tombstones = new Set<string>();
  let currentEpoch = 0;

  return {
    begin(id) {
      const generation = (generations.get(id) ?? 0) + 1;
      generations.set(id, generation);
      return { id, generation, epoch: currentEpoch };
    },
    isCurrent(token) {
      if (token.epoch !== currentEpoch) return false;
      if (tombstones.has(token.id)) return false;
      return generations.get(token.id) === token.generation;
    },
    invalidate(id) {
      generations.set(id, (generations.get(id) ?? 0) + 1);
    },
    tombstone(id) {
      tombstones.add(id);
      generations.delete(id);
    },
    isTombstoned(id) {
      return tombstones.has(id);
    },
    bumpEpoch() {
      currentEpoch += 1;
    },
    epoch() {
      return currentEpoch;
    },
  };
}
