import { DEFAULT_ANNOTATION_COLOR, isPaletteColor } from "./palette";

/**
 * Lightweight local preference for the most recently selected annotation color,
 * used as the color for newly created highlights. Persisted via localStorage
 * (the existing application local-state mechanism) — not in SQLite.
 */

export const LAST_USED_COLOR_KEY = "relax-note.annotation-color";

interface ReadStorage {
  getItem(key: string): string | null;
}

interface WriteStorage {
  setItem(key: string, value: string): void;
}

function defaultStorage(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

/**
 * Returns the last-used palette color, or the default (Yellow) when nothing
 * valid is stored. Invalid/obsolete stored values safely fall back.
 */
export function loadLastUsedColor(storage: ReadStorage | null = defaultStorage()): string {
  if (!storage) return DEFAULT_ANNOTATION_COLOR;
  try {
    const raw = storage.getItem(LAST_USED_COLOR_KEY);
    if (raw && isPaletteColor(raw)) return raw;
  } catch {
    // ignore storage access failures
  }
  return DEFAULT_ANNOTATION_COLOR;
}

/** Persists a last-used color. Non-palette values are ignored. */
export function saveLastUsedColor(
  color: string,
  storage: WriteStorage | null = defaultStorage(),
): void {
  if (!storage || !isPaletteColor(color)) return;
  try {
    storage.setItem(LAST_USED_COLOR_KEY, color);
  } catch {
    // ignore storage access failures
  }
}
