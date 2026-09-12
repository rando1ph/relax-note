import type { CSSProperties } from "react";
import { ANNOTATION_PALETTE } from "../annotations/palette";

interface ColorPaletteProps {
  /** Currently selected color (may be an arbitrary non-palette value). */
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

/**
 * Compact reusable annotation color control: a restrained 6×2 grid of preset
 * swatches. Selection is shown with a ring plus a checkmark (not color alone);
 * each swatch is keyboard-focusable with an accessible name.
 */
export function ColorPalette({ value, onChange, label = "Annotation color" }: ColorPaletteProps) {
  const current = value.trim().toLowerCase();

  return (
    <div className="color-palette" role="group" aria-label={label}>
      {ANNOTATION_PALETTE.map((preset) => {
        const selected = preset.value.toLowerCase() === current;
        return (
          <button
            key={preset.value}
            type="button"
            aria-pressed={selected}
            aria-label={preset.name}
            title={preset.name}
            className={"color-swatch" + (selected ? " selected" : "")}
            style={{ "--swatch-color": preset.value } as CSSProperties}
            onClick={() => onChange(preset.value)}
          >
            {selected ? (
              <svg className="color-swatch-check" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M2.5 6.4 L5 8.9 L9.5 3.4"
                  fill="none"
                  stroke="rgba(0, 0, 0, 0.4)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2.5 6.4 L5 8.9 L9.5 3.4"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
