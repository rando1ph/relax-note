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

    let wheelAccum = 0;
    let wheelRaf = 0;
    let wheelPointerY = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      wheelAccum += e.deltaY;
      wheelPointerY = e.clientY;
      if (wheelRaf) return;
      wheelRaf = requestAnimationFrame(() => {
        wheelRaf = 0;
        const accum = wheelAccum;
        wheelAccum = 0;
        if (Math.abs(accum) > 4) {
          commandsRef.current.zoomByWheel(accum, wheelPointerY);
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
