import { useState } from "react";
import type { ChangeEvent, KeyboardEvent, RefObject } from "react";

interface ReaderToolbarProps {
  pageCount: number;
  currentPage: number;
  scale: number;
  leftOpen: boolean;
  rightOpen: boolean;
  pageInputRef?: RefObject<HTMLInputElement | null>;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onGoToPage: (page: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onActualSize: () => void;
  onFitPage: () => void;
  onFitWidth: () => void;
}

export function ReaderToolbar({
  pageCount,
  currentPage,
  scale,
  leftOpen,
  rightOpen,
  pageInputRef,
  onToggleLeft,
  onToggleRight,
  onGoToPage,
  onPrev,
  onNext,
  onZoomIn,
  onZoomOut,
  onActualSize,
  onFitPage,
  onFitWidth,
}: ReaderToolbarProps) {
  const [pageInput, setPageInput] = useState<string>("");

  const commitPage = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (Number.isFinite(parsed)) onGoToPage(parsed);
    setPageInput("");
  };

  const onZoomSelect = (value: string) => {
    if (value === "actual") onActualSize();
    else if (value === "fitPage") onFitPage();
    else if (value === "fitWidth") onFitWidth();
  };

  return (
    <div className="toolbar">
      <button
        type="button"
        className={leftOpen ? "toggle active" : "toggle"}
        onClick={onToggleLeft}
        aria-label="Toggle left sidebar"
      >
        ☰
      </button>

      <span className="spacer" />

      <button type="button" onClick={onPrev} disabled={currentPage <= 1} aria-label="Previous page">
        ‹
      </button>
      <input
        ref={pageInputRef}
        className="page-input"
        inputMode="numeric"
        value={pageInput || String(currentPage)}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setPageInput(e.currentTarget.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") commitPage();
        }}
        onFocus={() => setPageInput(String(currentPage))}
        onBlur={commitPage}
        aria-label="Current page"
      />
      <span className="page-total">/ {pageCount}</span>
      <button
        type="button"
        onClick={onNext}
        disabled={currentPage >= pageCount}
        aria-label="Next page"
      >
        ›
      </button>

      <span className="spacer" />

      <button type="button" onClick={onZoomOut} aria-label="Zoom out">
        −
      </button>
      <span className="zoom-label">{Math.round(scale * 100)}%</span>
      <button type="button" onClick={onZoomIn} aria-label="Zoom in">
        +
      </button>
      <select
        className="zoom-select"
        value=""
        onChange={(e) => onZoomSelect(e.currentTarget.value)}
        aria-label="Zoom presets"
      >
        <option value="" disabled>
          Zoom
        </option>
        <option value="actual">Actual Size</option>
        <option value="fitPage">Fit Page</option>
        <option value="fitWidth">Fit Width</option>
      </select>

      <span className="spacer" />

      <button
        type="button"
        className={rightOpen ? "toggle active" : "toggle"}
        onClick={onToggleRight}
        aria-label="Toggle right sidebar"
      >
        ☰
      </button>
    </div>
  );
}
