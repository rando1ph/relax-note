export interface AppCommands {
  openFile: () => void;
  closeDocument: () => void;
  quit: () => void;
  copy: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomByWheel: (deltaY: number, clientX?: number, clientY?: number) => void;
  actualSize: () => void;
  fitPage: () => void;
  fitWidth: () => void;
  previousPage: () => void;
  nextPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  goToPage: () => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  toggleFullscreen: () => void;
  about: () => void;
  openRecent: (path: string) => void;
}
