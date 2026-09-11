import { useEffect, useState } from "react";
import { getActiveZoomTxn, isRecording } from "./recorder";

interface OverlayState {
  page: string | null;
  scale: string | null;
  scrollTop: number | null;
  txn: string | null;
}

/**
 * Development-only visual overlay shown while a diagnostic session is active.
 */
export function DiagOverlay() {
  const [state, setState] = useState<OverlayState | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!isRecording()) {
        setState(null);
        return;
      }
      const viewer = document.querySelector<HTMLElement>(".viewer");
      setState({
        page: document.querySelector<HTMLInputElement>(".page-input")?.value ?? null,
        scale: document.querySelector<HTMLElement>(".zoom-label")?.textContent ?? null,
        scrollTop: viewer ? Math.round(viewer.scrollTop) : null,
        txn: getActiveZoomTxn(),
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  if (!import.meta.env.DEV || !state) return null;

  return (
    <div className="diag-overlay">
      <span>rec</span>
      <span>page: {state.page}</span>
      <span>scale: {state.scale}</span>
      <span>scrollTop: {state.scrollTop}</span>
      {state.txn ? <span>txn: {state.txn}</span> : null}
    </div>
  );
}
