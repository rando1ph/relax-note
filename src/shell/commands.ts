import type { ReadingMode } from "../state/readerState";

export interface AppCommands {
  openFile: () => void;
  closeDocument: () => void;
  quit: () => void;
  copy: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomByWheel: (deltaY: number, pointerY?: number) => void;
  actualSize: () => void;
  fitPage: () => void;
  fitWidth: () => void;
  previousPage: () => void;
  nextPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  goToPage: () => void;
  setReadingMode: (mode: ReadingMode) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  toggleFullscreen: () => void;
  about: () => void;
  openRecent: (path: string) => void;
  startDiagnostics: () => void;
  stopDiagnostics: () => void;
}
