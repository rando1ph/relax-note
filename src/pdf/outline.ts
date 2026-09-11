import type { PDFDocumentProxy } from "./pdfjs";

export interface OutlineItem {
  title: string;
  pageNumber: number | null;
  children: OutlineItem[];
}

function isPageRef(value: unknown): value is { num: number; gen: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { num?: unknown }).num === "number"
  );
}

async function resolveDestination(
  pdfDocument: PDFDocumentProxy,
  dest: string | unknown[] | null | undefined,
): Promise<number | null> {
  if (dest == null) return null;

  let resolved: unknown[] | null = null;
  if (typeof dest === "string") {
    try {
      resolved = await pdfDocument.getDestination(dest);
    } catch {
      return null;
    }
  } else if (Array.isArray(dest)) {
    resolved = dest;
  }

  if (!Array.isArray(resolved) || resolved.length === 0) return null;

  const first = resolved[0];
  let pageIndex: number | null = null;
  if (isPageRef(first)) {
    try {
      pageIndex = await pdfDocument.getPageIndex(first);
    } catch {
      return null;
    }
  } else if (typeof first === "number") {
    pageIndex = first;
  }

  if (pageIndex == null) return null;
  return pageIndex + 1;
}

export async function getOutline(
  pdfDocument: PDFDocumentProxy,
): Promise<OutlineItem[]> {
  let outline: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>;
  try {
    outline = await pdfDocument.getOutline();
  } catch {
    return [];
  }
  if (!outline || outline.length === 0) return [];

  const convert = async (
    items: typeof outline,
  ): Promise<OutlineItem[]> => {
    const result: OutlineItem[] = [];
    for (const item of items) {
      const pageNumber = await resolveDestination(pdfDocument, item.dest);
      const children = item.items ? await convert(item.items) : [];
      result.push({ title: item.title, pageNumber, children });
    }
    return result;
  };

  return convert(outline);
}
