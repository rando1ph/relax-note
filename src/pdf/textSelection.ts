import { normalizeUnicode } from "pdfjs-dist";

/**
 * Mirrors the selection handling of PDF.js's official `TextLayerBuilder` so
 * that text selection behaves like the stock PDF.js viewer rather than a
 * partial custom approximation.
 *
 * The key pieces are:
 * - an `.endOfContent` element appended to each text layer (the "virtual end"
 *   that gives the browser a stable anchor below the last line);
 * - a `.selecting` class toggled on the layer during a drag;
 * - a global selection listener that repositions the `.endOfContent` next to
 *   the selection anchor for non-modern engines, preventing the selection from
 *   jumping to unrelated text.
 */

const textLayers = new Map<HTMLElement, HTMLElement>();
let selectionChangeAC: AbortController | null = null;
let isPointerDown = false;

function removeNullCharacters(str: string): string {
  return str.replace(/\u0000/g, "");
}

function stopEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

function reset(end: HTMLElement, textLayer: HTMLElement): void {
  textLayer.append(end);
  end.style.width = "";
  end.style.height = "";
  end.style.userSelect = "";
  textLayer.classList.remove("selecting");
}

function enableGlobalSelectionListener(): void {
  if (selectionChangeAC) return;
  selectionChangeAC = new AbortController();
  const { signal } = selectionChangeAC;

  document.addEventListener(
    "pointerdown",
    () => {
      isPointerDown = true;
    },
    { signal },
  );

  document.addEventListener(
    "pointerup",
    () => {
      isPointerDown = false;
      textLayers.forEach((end, layer) => reset(end, layer));
    },
    { signal },
  );

  window.addEventListener(
    "blur",
    () => {
      isPointerDown = false;
      textLayers.forEach((end, layer) => reset(end, layer));
    },
    { signal },
  );

  document.addEventListener(
    "keyup",
    () => {
      if (!isPointerDown) {
        textLayers.forEach((end, layer) => reset(end, layer));
      }
    },
    { signal },
  );

  let isFirefoxOrModernChromium: boolean | undefined;
  let prevRange: Range | null = null;

  document.addEventListener(
    "selectionchange",
    () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) {
        textLayers.forEach((end, layer) => reset(end, layer));
        return;
      }

      const activeTextLayers = new Set<HTMLElement>();
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        for (const textLayerDiv of textLayers.keys()) {
          if (!activeTextLayers.has(textLayerDiv) && range.intersectsNode(textLayerDiv)) {
            activeTextLayers.add(textLayerDiv);
          }
        }
      }

      for (const [textLayerDiv, endDiv] of textLayers) {
        if (activeTextLayers.has(textLayerDiv)) {
          textLayerDiv.classList.add("selecting");
        } else {
          reset(endDiv, textLayerDiv);
        }
      }

      if (isFirefoxOrModernChromium === undefined) {
        const firstLayer = textLayers.values().next().value;
        isFirefoxOrModernChromium =
          !!firstLayer &&
          getComputedStyle(firstLayer).getPropertyValue("-moz-user-select") === "none";
        if (!isFirefoxOrModernChromium) {
          const nav = navigator as Navigator & {
            userAgentData?: { brands?: { brand: string; version: string }[] };
          };
          const chromiumVersion = nav.userAgentData
            ? nav.userAgentData.brands?.find((b) => b.brand === "Chromium")?.version
            : /\bChrome\/(\d+)\b/.exec(navigator.userAgent)?.[1];
          isFirefoxOrModernChromium =
            !!chromiumVersion && parseInt(chromiumVersion, 10) >= 148;
        }
      }

      if (isFirefoxOrModernChromium) return;

      const range = selection.getRangeAt(0);
      const modifyStart =
        !!prevRange &&
        (range.compareBoundaryPoints(Range.END_TO_END, prevRange) === 0 ||
          range.compareBoundaryPoints(Range.START_TO_END, prevRange) === 0);
      let anchor: Node = modifyStart ? range.startContainer : range.endContainer;
      if (anchor.nodeType === Node.TEXT_NODE) {
        anchor = anchor.parentNode as HTMLElement;
      }
      if ((anchor as HTMLElement).classList?.contains("highlight")) {
        anchor = anchor.parentNode as HTMLElement;
      }
      if (!modifyStart && range.endOffset === 0) {
        do {
          while (!anchor.previousSibling) {
            anchor = anchor.parentNode as HTMLElement;
          }
          anchor = anchor.previousSibling;
        } while (!(anchor as HTMLElement).childNodes.length);
      }
      const parentTextLayer = (anchor as HTMLElement).parentElement?.closest(
        ".textLayer",
      );
      const endDiv = parentTextLayer
        ? textLayers.get(parentTextLayer as HTMLElement)
        : undefined;
      if (endDiv && parentTextLayer) {
        endDiv.style.width = (parentTextLayer as HTMLElement).style.width;
        endDiv.style.height = (parentTextLayer as HTMLElement).style.height;
        endDiv.style.userSelect = "text";
        (anchor as HTMLElement).parentElement!.insertBefore(
          endDiv,
          modifyStart ? anchor : anchor.nextSibling,
        );
      }
      prevRange = range.cloneRange();
    },
    { signal },
  );
}

export function registerTextLayer(
  textLayerDiv: HTMLElement,
  endOfContent: HTMLElement,
): void {
  textLayers.set(textLayerDiv, endOfContent);
  enableGlobalSelectionListener();
}

export function unregisterTextLayer(textLayerDiv: HTMLElement): void {
  textLayers.delete(textLayerDiv);
  if (textLayers.size === 0) {
    selectionChangeAC?.abort();
    selectionChangeAC = null;
  }
}

export function handleTextLayerCopy(
  _textLayerDiv: HTMLElement,
  event: ClipboardEvent,
): void {
  const selection = document.getSelection();
  if (!selection) return;
  const text = removeNullCharacters(normalizeUnicode(selection.toString()));
  event.clipboardData?.setData("text/plain", text);
  stopEvent(event);
}
