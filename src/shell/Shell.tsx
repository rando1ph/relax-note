import { useEffect, useRef } from "react";
import { message } from "@tauri-apps/plugin-dialog";
import { useWorkspace } from "../state/workspace";
import { TabBar } from "./TabBar";
import { ReaderToolbar } from "../toolbar/ReaderToolbar";
import { LeftSidebar } from "../sidebar/LeftSidebar";
import { RightSidebar } from "../sidebar/RightSidebar";
import { ResizablePanel } from "../sidebar/ResizablePanel";
import { HomeView } from "../home/HomeView";
import { PdfViewer } from "../viewer/PdfViewer";
import type { ViewerHandle } from "../viewer/PdfViewer";
import { closeWindow, setWindowTitle, toggleFullscreen } from "../platform/window";
import { useAppMenu } from "./menu";
import { useKeyboard } from "./useKeyboard";
import type { AppCommands } from "./commands";

function copySelection(): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  try {
    document.execCommand("copy");
  } catch {
    // ignore
  }
}

export function Shell() {
  const ws = useWorkspace();
  const viewerRef = useRef<ViewerHandle>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);

  const active = ws.activeTab;
  const proxy = active ? ws.getDocumentProxy(active.id) : null;

  const commands: AppCommands = {
    openFile: () => void ws.openFromDialog(),
    closeDocument: () => {
      if (active) ws.closeTab(active.id);
    },
    quit: () => void closeWindow(),
    copy: () => copySelection(),
    zoomIn: () => viewerRef.current?.zoomIn(),
    zoomOut: () => viewerRef.current?.zoomOut(),
    zoomByWheel: (deltaY, clientX, clientY) =>
      viewerRef.current?.zoomByWheel(deltaY, clientX, clientY),
    actualSize: () => viewerRef.current?.actualSize(),
    fitPage: () => viewerRef.current?.fitPage(),
    fitWidth: () => viewerRef.current?.fitWidth(),
    previousPage: () => ws.navigate("prev"),
    nextPage: () => ws.navigate("next"),
    firstPage: () => ws.navigate("first"),
    lastPage: () => ws.navigate("last"),
    goToPage: () => {
      pageInputRef.current?.focus();
      pageInputRef.current?.select();
    },
    toggleLeftSidebar: () => ws.toggleSidebar("left"),
    toggleRightSidebar: () => ws.toggleSidebar("right"),
    toggleFullscreen: () => void toggleFullscreen(),
    about: () =>
      void message("Relax Note — a calm place to read and annotate PDFs.", {
        title: "About Relax Note",
      }),
    openRecent: (path) => void ws.openPath(path),
  };

  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  const recentKey = ws.tabs.map((t) => t.id).join(",");
  useAppMenu(commandsRef, { recentKey });
  useKeyboard(commandsRef);

  useEffect(() => {
    const title = active ? `${active.title} — Relax Note` : "Relax Note";
    void setWindowTitle(title).catch(() => undefined);
  }, [active?.id, active?.title]);

  const ready = active !== null && active.status === "ready" && proxy !== null;

  return (
    <div className="app-shell">
      <TabBar />

      {active && active.status === "ready" && proxy ? (
        <ReaderToolbar
          pageCount={active.pageCount ?? 0}
          currentPage={active.readerState.currentPage}
          scale={active.readerState.scale}
          leftOpen={ws.leftSidebar.open}
          rightOpen={ws.rightSidebar.open}
          pageInputRef={pageInputRef}
          onToggleLeft={() => ws.toggleSidebar("left")}
          onToggleRight={() => ws.toggleSidebar("right")}
          onGoToPage={(p) => ws.goToPage(p)}
          onPrev={() => ws.navigate("prev")}
          onNext={() => ws.navigate("next")}
          onZoomIn={commands.zoomIn}
          onZoomOut={commands.zoomOut}
          onActualSize={commands.actualSize}
          onFitPage={commands.fitPage}
          onFitWidth={commands.fitWidth}
        />
      ) : null}

      <div className="workspace">
        {active ? (
          active.status === "error" ? (
            <main className="workspace-center">
              <div className="state-overlay">
                <div className="error-banner">{active.error}</div>
                <button type="button" onClick={() => ws.closeTab(active.id)}>
                  Close
                </button>
              </div>
            </main>
          ) : !ready ? (
            <main className="workspace-center">
              <div className="state-overlay">
                <p>Opening “{active.title}”…</p>
              </div>
            </main>
          ) : (
            <>
              {ws.leftSidebar.open ? (
                <ResizablePanel
                  side="left"
                  width={ws.leftSidebar.width}
                  onResize={(w) => ws.setSidebarWidth("left", w)}
                >
                  <LeftSidebar
                    pdfDocument={proxy}
                    pageCount={active.pageCount ?? 0}
                    currentPage={active.readerState.currentPage}
                    onNavigate={(p) => ws.goToPage(p)}
                  />
                </ResizablePanel>
              ) : null}

              <main className="workspace-center">
                <PdfViewer
                  key={active.id}
                  ref={viewerRef}
                  pdfDocument={proxy}
                  pageCount={active.pageCount ?? 0}
                  scale={active.readerState.scale}
                  currentPage={active.readerState.currentPage}
                  needsAutoFit={active.needsAutoFit}
                  onScaleChange={(s) => ws.setReaderState(active.id, { scale: s })}
                  onCurrentPageChange={(p) =>
                    ws.setReaderState(active.id, { currentPage: p })
                  }
                />
              </main>

              {ws.rightSidebar.open ? (
                <ResizablePanel
                  side="right"
                  width={ws.rightSidebar.width}
                  onResize={(w) => ws.setSidebarWidth("right", w)}
                >
                  <RightSidebar />
                </ResizablePanel>
              ) : null}
            </>
          )
        ) : (
          <main className="workspace-center">
            <HomeView />
          </main>
        )}
      </div>
    </div>
  );
}
