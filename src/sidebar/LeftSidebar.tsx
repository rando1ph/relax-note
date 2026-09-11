import { useState } from "react";
import type { PDFDocumentProxy } from "../pdf/pdfjs";
import { OutlinePanel } from "./OutlinePanel";
import { ThumbnailsPanel } from "./ThumbnailsPanel";

type LeftTab = "outline" | "thumbnails";

interface LeftSidebarProps {
  pdfDocument: PDFDocumentProxy;
  pageCount: number;
  currentPage: number;
  onNavigate: (page: number) => void;
}

export function LeftSidebar({
  pdfDocument,
  pageCount,
  currentPage,
  onNavigate,
}: LeftSidebarProps) {
  const [tab, setTab] = useState<LeftTab>("outline");

  return (
    <div className="sidebar-inner">
      <div className="sidebar-tabs">
        <button
          type="button"
          className={tab === "outline" ? "sidebar-tab active" : "sidebar-tab"}
          onClick={() => setTab("outline")}
        >
          Outline
        </button>
        <button
          type="button"
          className={tab === "thumbnails" ? "sidebar-tab active" : "sidebar-tab"}
          onClick={() => setTab("thumbnails")}
        >
          Thumbnails
        </button>
      </div>
      <div className="sidebar-content">
        {tab === "outline" ? (
          <OutlinePanel pdfDocument={pdfDocument} onNavigate={onNavigate} />
        ) : (
          <ThumbnailsPanel
            pdfDocument={pdfDocument}
            pageCount={pageCount}
            currentPage={currentPage}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </div>
  );
}
