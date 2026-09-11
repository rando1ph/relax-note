export const MIN_SCALE = 0.25;
export const MAX_SCALE = 8;

const STEP_FACTOR = 1.25;
const WHEEL_FACTOR = 1.1;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function zoomIn(scale: number): number {
  return clampScale(scale * STEP_FACTOR);
}

export function zoomOut(scale: number): number {
  return clampScale(scale / STEP_FACTOR);
}

export function zoomByWheel(scale: number, deltaY: number): number {
  const factor = deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR;
  return clampScale(scale * factor);
}

/** 100% = PDF user units rendered at 1 CSS px. */
export function actualSizeScale(): number {
  return 1;
}

export function fitWidthScale(
  containerWidth: number,
  basePageWidth: number,
  padding = 0,
): number {
  const available = containerWidth - padding;
  if (available <= 0 || basePageWidth <= 0) return 1;
  return clampScale(available / basePageWidth);
}

export function fitPageScale(
  containerWidth: number,
  containerHeight: number,
  basePageWidth: number,
  basePageHeight: number,
  padding = 0,
): number {
  const availableW = containerWidth - padding;
  const availableH = containerHeight - padding;
  if (availableW <= 0 || availableH <= 0 || basePageWidth <= 0 || basePageHeight <= 0) {
    return 1;
  }
  return clampScale(Math.min(availableW / basePageWidth, availableH / basePageHeight));
}

/** A sensible first-open zoom: fit the whole page, never oversized. */
export function defaultOpenScale(
  containerWidth: number,
  containerHeight: number,
  basePageWidth: number,
  basePageHeight: number,
  padding = 0,
): number {
  return Math.min(1, fitPageScale(containerWidth, containerHeight, basePageWidth, basePageHeight, padding));
}
