import { useEffect, useRef, useState } from "react";
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
  // Local draft string so the field behaves like a normal editable input:
  // an empty draft stays empty while editing and is never force-repopulated.
  const [pageDraft, setPageDraft] = useState<string>(String(currentPage));
  const [isEditingPage, setIsEditingPage] = useState(false);
  const cancelCommitRef = useRef(false);

  // Sync from the external current page only while the user is not editing.
  useEffect(() => {
    if (!isEditingPage) setPageDraft(String(currentPage));
  }, [currentPage, isEditingPage]);

  const commitPage = () => {
    const trimmed = pageDraft.trim();
    if (trimmed === "") {
      setPageDraft(String(currentPage));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed)) {
      setPageDraft(String(currentPage));
      return;
    }
    const clamped = Math.min(Math.max(1, parsed), pageCount);
    onGoToPage(clamped);
    setPageDraft(String(clamped));
  };

  const onPageBlur = () => {
    setIsEditingPage(false);
    if (cancelCommitRef.current) {
      cancelCommitRef.current = false;
      setPageDraft(String(currentPage));
      return;
    }
    commitPage();
  };

  const onPageKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Blurring commits via onPageBlur, so the field leaves edit mode and
      // resumes syncing with external page changes.
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelCommitRef.current = true;
      setIsEditingPage(false);
      setPageDraft(String(currentPage));
      e.currentTarget.blur();
    }
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
        value={pageDraft}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setPageDraft(e.currentTarget.value)}
        onFocus={() => setIsEditingPage(true)}
        onKeyDown={onPageKeyDown}
        onBlur={onPageBlur}
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
