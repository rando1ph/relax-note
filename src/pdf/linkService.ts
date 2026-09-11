import { useMemo, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { PDFDocumentProxy } from "./pdfjs";

/**
 * Minimal PDF link service for the native PDF annotation layer, modeled on
 * the official PDF.js `SimpleLinkService`/`PDFLinkService` interface that
 * `AnnotationLayer` expects. Kept tiny on purpose: it only supports internal
 * destination navigation and external URLs.
 */
export interface PdfLinkService {
  eventBus: undefined;
  isInPresentationMode: boolean;
  getDestinationHash(dest: unknown): string;
  getAnchorUrl(anchor: string): string;
  goToDestination(dest: unknown): Promise<void>;
  executeNamedAction(action: unknown): void;
  addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow: boolean): void;
  getAttachmentContent(_id: string): Promise<null>;
  executeSetOCGState(_action: unknown): void;
  /** Relax Note extension: open an external URL in the OS default handler. */
  openExternal?: (url: string) => void;
}

interface LinkServiceOptions {
  pdfDocument: PDFDocumentProxy;
  pageCount: number;
  onNavigateToPage: (page: number) => void;
  onOpenExternal: (url: string) => void;
}

export function createPdfLinkService({
  pdfDocument,
  pageCount,
  onNavigateToPage,
  onOpenExternal,
}: LinkServiceOptions): PdfLinkService {
  const service: PdfLinkService = {
    eventBus: undefined,
    isInPresentationMode: false,

    getDestinationHash(dest: unknown): string {
      if (typeof dest === "string") {
        return `#${encodeURIComponent(dest)}`;
      }
      return "";
    },

    getAnchorUrl(anchor: string): string {
      return anchor;
    },

    async goToDestination(dest: unknown): Promise<void> {
      let explicitDest: unknown[] | null;
      if (typeof dest === "string") {
        try {
          explicitDest = (await pdfDocument.getDestination(dest)) as unknown[] | null;
        } catch {
          return;
        }
      } else {
        explicitDest = (await Promise.resolve(dest)) as unknown[] | null;
      }
      if (!Array.isArray(explicitDest)) return;

      const destRef = explicitDest[0] as unknown;
      let pageNumber: number | null = null;
      if (destRef && typeof destRef === "object") {
        try {
          pageNumber =
            (await pdfDocument.getPageIndex(
              destRef as { num: number; gen: number },
            )) + 1;
        } catch {
          return;
        }
      } else if (Number.isInteger(destRef)) {
        pageNumber = (destRef as number) + 1;
      }
      if (pageNumber == null || pageNumber < 1 || pageNumber > pageCount) return;
      onNavigateToPage(pageNumber);
    },

    executeNamedAction(action: unknown): void {
      const a = action as { action?: string; dest?: unknown; pageNumber?: number };
      if (a && typeof a === "object") {
        if (a.action === "GoTo" && a.dest != null) {
          void service.goToDestination(a.dest);
        } else if (a.action === "GoToPage" && typeof a.pageNumber === "number") {
          const page = a.pageNumber + 1;
          if (page >= 1 && page <= pageCount) onNavigateToPage(page);
        }
      }
    },

    addLinkAttributes(link: HTMLAnchorElement, url: string, newWindow: boolean): void {
      link.href = url;
      link.title = url;
      link.target = newWindow ? "_blank" : "_blank";
      link.rel = "noopener noreferrer";
      link.dataset.externalLink = "true";
    },

    async getAttachmentContent(): Promise<null> {
      return null;
    },

    executeSetOCGState(): void {
      // Not supported in Relax Note.
    },

    openExternal: (url: string) => onOpenExternal(url),
  };

  return service;
}

/** Stable per-document link service that drives the native annotation layer. */
export function usePdfLinkService(
  pdfDocument: PDFDocumentProxy,
  pageCount: number,
  onNavigateToPage: (page: number) => void,
): PdfLinkService {
  const onNavigateRef = useRef(onNavigateToPage);
  onNavigateRef.current = onNavigateToPage;

  return useMemo(
    () =>
      createPdfLinkService({
        pdfDocument,
        pageCount,
        onNavigateToPage: (page) => onNavigateRef.current(page),
        onOpenExternal: (url) => {
          void openUrl(url).catch(() => undefined);
        },
      }),
    [pdfDocument, pageCount],
  );
}
