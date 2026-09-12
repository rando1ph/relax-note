import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { AppCommands } from "./commands";

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function useKeyboard(commandsRef: MutableRefObject<AppCommands>) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const c = commandsRef.current;
      switch (e.key) {
        case "PageDown":
          e.preventDefault();
          c.nextPage();
          break;
        case "PageUp":
          e.preventDefault();
          c.previousPage();
          break;
        case "Home":
          e.preventDefault();
          c.firstPage();
          break;
        case "End":
          e.preventDefault();
          c.lastPage();
          break;
        default:
          break;
      }
    };

    let wheelTicks = 0;
    let wheelRaf = 0;
    let wheelPointerX = 0;
    let wheelPointerY = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // Normalize to official PDF.js "ticks": one tick = one discrete wheel
      // notch (= 1.1x zoom factor). Line/page-based deltas count one tick per
      // event; pixel-based deltas count one tick per 30 px (mirrors the
      // official viewer's PIXELS_PER_LINE_SCALE normalization).
      if (
        e.deltaMode === WheelEvent.DOM_DELTA_LINE ||
        e.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ) {
        wheelTicks += Math.abs(e.deltaY) >= 1 ? Math.sign(e.deltaY) : e.deltaY;
      } else {
        wheelTicks += e.deltaY / 30;
      }
      wheelPointerX = e.clientX;
      wheelPointerY = e.clientY;
      if (wheelRaf) return;
      wheelRaf = requestAnimationFrame(() => {
        wheelRaf = 0;
        const accum = wheelTicks;
        wheelTicks = 0;
        if (Math.abs(accum) > 0.05) {
          commandsRef.current.zoomByWheel(accum, wheelPointerX, wheelPointerY);
        }
      });
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
      if (wheelRaf) cancelAnimationFrame(wheelRaf);
    };
  }, [commandsRef]);
}
