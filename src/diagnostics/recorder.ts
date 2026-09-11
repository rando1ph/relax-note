import { trace } from "@tauri-apps/plugin-log";

/**
 * Development-only diagnostic recorder. Emits one JSON object per event via
 * the Tauri log plugin (TRACE level), which persists to the app log directory
 * and stdout. No user typing is ever captured; only reader navigation/zoom
 * input and viewer state are recorded.
 */

export interface RecorderContext {
  docId?: string;
  docName?: string;
  mode?: string;
  page?: number;
  scale?: number;
}

interface ZoomTxnRecent {
  id: string;
  endedAt: number;
}

let sessionId: string | null = null;
let sessionStart = 0;
let context: RecorderContext = {};
let activeZoomTxn: string | null = null;
let recentZoomTxn: ZoomTxnRecent | null = null;
let txnCounter = 0;

let wheelHandler: ((e: WheelEvent) => void) | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

export function isRecording(): boolean {
  return sessionId !== null;
}

export function getSessionId(): string | null {
  return sessionId;
}

export function getActiveZoomTxn(): string | null {
  return activeZoomTxn;
}

export function setRecorderContext(ctx: RecorderContext): void {
  context = ctx;
}

export function getRecorderContext(): RecorderContext {
  return context;
}

function relMs(): number {
  return Math.round(performance.now() - sessionStart);
}

function associatedZoomTxn(): string | null {
  if (activeZoomTxn) return activeZoomTxn;
  if (recentZoomTxn && performance.now() - recentZoomTxn.endedAt < 1000) {
    return recentZoomTxn.id;
  }
  return null;
}

export function hasRecentZoomActivity(): boolean {
  return associatedZoomTxn() !== null;
}

function viewerState() {
  const viewer = document.querySelector<HTMLElement>(".viewer");
  return {
    scrollTop: viewer?.scrollTop ?? null,
    clientHeight: viewer?.clientHeight ?? null,
    scrollHeight: viewer?.scrollHeight ?? null,
  };
}

export function record(type: string, extra: Record<string, unknown> = {}): void {
  if (!sessionId) return;
  const rec: Record<string, unknown> = {
    sid: sessionId,
    t: relMs(),
    type,
    doc: context.docName ?? null,
    docId: context.docId ?? null,
    mode: context.mode ?? null,
    page: context.page ?? null,
    scale: context.scale ?? null,
    ...viewerState(),
    ...extra,
  };
  if (rec.zoomTxnId == null) {
    const associated = associatedZoomTxn();
    if (associated) rec.zoomTxnId = associated;
  }
  void trace(JSON.stringify(rec));
}

// --- Zoom transaction lifecycle -------------------------------------------

export function beginZoomTxn(): string {
  txnCounter += 1;
  const id = `z${txnCounter}`;
  activeZoomTxn = id;
  recentZoomTxn = null;
  return id;
}

export function endZoomTxn(id: string): void {
  if (activeZoomTxn === id) {
    activeZoomTxn = null;
    recentZoomTxn = { id, endedAt: performance.now() };
  }
}

// --- Input listeners (active only while recording) -------------------------

const NAV_KEYS = new Set(["PageUp", "PageDown", "Home", "End"]);

function targetSummary(target: EventTarget | null): string {
  if (target instanceof Element) {
    const cls = typeof target.className === "string" ? target.className : "";
    const clsStr = cls ? `.${cls.trim().split(/\s+/).join(".")}` : "";
    return `${target.tagName.toLowerCase()}${clsStr}`;
  }
  return "unknown";
}

function onWheel(e: WheelEvent): void {
  record("INPUT_WHEEL", {
    deltaX: e.deltaX,
    deltaY: e.deltaY,
    ctrlKey: e.ctrlKey,
    clientX: e.clientX,
    clientY: e.clientY,
    target: targetSummary(e.target),
    defaultPrevented: e.defaultPrevented,
  });
}

function onKey(e: KeyboardEvent): void {
  const isNav = NAV_KEYS.has(e.key);
  const isZoom = e.ctrlKey && (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "0");
  if (!isNav && !isZoom) return;
  record("INPUT_KEY", {
    key: e.key,
    ctrlKey: e.ctrlKey,
    target: targetSummary(e.target),
    defaultPrevented: e.defaultPrevented,
  });
}

function attachInputListeners(): void {
  wheelHandler = onWheel;
  keyHandler = onKey;
  window.addEventListener("wheel", wheelHandler, { passive: false });
  window.addEventListener("keydown", keyHandler, true);
}

function detachInputListeners(): void {
  if (wheelHandler) window.removeEventListener("wheel", wheelHandler);
  if (keyHandler) window.removeEventListener("keydown", keyHandler, true);
  wheelHandler = null;
  keyHandler = null;
}

// --- Session control -------------------------------------------------------

export function startSession(): string {
  sessionId = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  sessionStart = performance.now();
  activeZoomTxn = null;
  recentZoomTxn = null;
  attachInputListeners();
  record("SESSION_START", {});
  return sessionId;
}

export function stopSession(): void {
  if (!sessionId) return;
  record("SESSION_END", {});
  detachInputListeners();
  sessionId = null;
  activeZoomTxn = null;
  recentZoomTxn = null;
}
