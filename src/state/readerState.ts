/**
 * Per-document reader state that is persisted and restored across sessions.
 * Relax Note is a paged-only reader, so there is no reading-mode or
 * continuous scroll position here.
 */
export interface ReaderState {
  currentPage: number;
  /** Absolute zoom factor (1 = 100%). */
  scale: number;
}

export const DEFAULT_READER_STATE: ReaderState = {
  currentPage: 1,
  scale: 1,
};

export interface StoredReaderState {
  lastPage: number | null;
  zoom: number | null;
}
