export type ReadingMode = "paged" | "continuous";

/**
 * Per-document reader state that is persisted and restored across sessions.
 * `scrollOffset` is a normalized 0..1 vertical position within `currentPage`,
 * used for approximate position restore in continuous mode.
 */
export interface ReaderState {
  currentPage: number;
  /** Absolute zoom factor (1 = 100%). */
  scale: number;
  readingMode: ReadingMode;
  scrollOffset: number;
}

export const DEFAULT_READER_STATE: ReaderState = {
  currentPage: 1,
  scale: 1,
  readingMode: "continuous",
  scrollOffset: 0,
};

export interface StoredReaderState {
  lastPage: number | null;
  zoom: number | null;
  readingMode: ReadingMode | null;
  scrollOffset: number | null;
}
