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

const outlineCache = new WeakMap<PDFDocumentProxy, Promise<OutlineItem[]>>();

/** Memoized outline load, used for cheap best-effort section headings. */
export function getOutlineCached(pdfDocument: PDFDocumentProxy): Promise<OutlineItem[]> {
  let cached = outlineCache.get(pdfDocument);
  if (!cached) {
    cached = getOutline(pdfDocument);
    outlineCache.set(pdfDocument, cached);
  }
  return cached;
}

/** Flattens an outline tree in reading (pre-order) order. */
export function flattenOutline(items: OutlineItem[]): OutlineItem[] {
  const result: OutlineItem[] = [];
  const visit = (list: OutlineItem[]) => {
    for (const item of list) {
      result.push(item);
      if (item.children.length > 0) visit(item.children);
    }
  };
  visit(items);
  return result;
}

/** Best-effort section heading: the last outline entry at or before `page`. */
export function headingForPage(
  items: OutlineItem[],
  page: number,
): string | null {
  let heading: string | null = null;
  for (const item of flattenOutline(items)) {
    if (item.pageNumber != null && item.pageNumber <= page && item.title.trim()) {
      heading = item.title.trim();
    }
  }
  return heading;
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
