import { forwardRef } from "react";
import type { ReadingMode } from "../state/readerState";
import { ContinuousViewer } from "./ContinuousViewer";
import { PagedViewer } from "./PagedViewer";
import type { ViewerHandle, ViewerProps } from "./types";

export type { ViewerHandle, ViewerProps };

interface PdfViewerProps extends ViewerProps {
  readingMode: ReadingMode;
}

export const PdfViewer = forwardRef<ViewerHandle, PdfViewerProps>(
  function PdfViewer({ readingMode, ...viewerProps }, ref) {
    if (readingMode === "paged") {
      return <PagedViewer ref={ref} {...viewerProps} />;
    }
    return <ContinuousViewer ref={ref} {...viewerProps} />;
  },
);
