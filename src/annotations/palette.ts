/**
 * Canonical Relax Note annotation color palette. This is the single source of
 * truth for annotation color UI (inspector palette, list swatches, markers).
 * The database stores the selected opaque hex string; no schema constraint
 * limits it to these presets.
 */

export interface AnnotationColorPreset {
  name: string;
  value: string;
}

export const ANNOTATION_PALETTE: readonly AnnotationColorPreset[] = [
  { name: "Yellow", value: "#FFD400" },
  { name: "Orange", value: "#FF9F0A" },
  { name: "Coral", value: "#FF6B5E" },
  { name: "Pink", value: "#FF6482" },
  { name: "Rose", value: "#D94F70" },
  { name: "Purple", value: "#AF52DE" },
  { name: "Indigo", value: "#5E5CE6" },
  { name: "Blue", value: "#0A84FF" },
  { name: "Cyan", value: "#32ADE6" },
  { name: "Teal", value: "#30B0C7" },
  { name: "Green", value: "#34C759" },
  { name: "Lime", value: "#9ACD32" },
] as const;

export const DEFAULT_ANNOTATION_COLOR = "#FFD400";

function normalize(color: string): string {
  return color.trim().toLowerCase();
}

/** True when `value` matches a curated palette preset (case-insensitive). */
export function isPaletteColor(value: string): boolean {
  const v = normalize(value);
  return ANNOTATION_PALETTE.some((preset) => normalize(preset.value) === v);
}

/** Returns the preset name for a color, or undefined when not in the palette. */
export function paletteColorName(value: string): string | undefined {
  const v = normalize(value);
  return ANNOTATION_PALETTE.find((preset) => normalize(preset.value) === v)?.name;
}
