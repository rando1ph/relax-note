/**
 * Wavy underline path for a vocabulary segment. The path is guaranteed to stay
 * within the segment's x-range: short selections reduce the wavelength and
 * amplitude rather than extending beyond the geometry.
 */

export const BASE_AMPLITUDE = 1.2;
export const BASE_WAVELENGTH = 6;
export const UNDERLINE_INSET = 1;

export function buildWavyUnderlinePath(
  x: number,
  y: number,
  width: number,
  amplitude: number = BASE_AMPLITUDE,
  wavelength: number = BASE_WAVELENGTH,
): string {
  if (!(width > 0)) return "";

  const effectiveWavelength = Math.min(wavelength, width);
  const halfWavelength = effectiveWavelength / 2;
  const segments = Math.max(1, Math.round(width / halfWavelength));
  const step = width / segments;
  const effectiveAmplitude = Math.min(amplitude, width / 4);

  let d = `M ${x.toFixed(2)} ${y.toFixed(2)}`;
  let direction = -1;
  for (let i = 0; i < segments; i++) {
    const x0 = x + i * step;
    const x1 = x0 + step;
    const cx = (x0 + x1) / 2;
    const cy = y + direction * effectiveAmplitude;
    d += ` Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${x1.toFixed(2)} ${y.toFixed(2)}`;
    direction = -direction;
  }
  return d;
}
