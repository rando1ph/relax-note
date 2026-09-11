import { useRef } from "react";
import type { PointerEvent, ReactNode } from "react";

interface ResizablePanelProps {
  side: "left" | "right";
  width: number;
  onResize: (width: number) => void;
  children: ReactNode;
}

export function ResizablePanel({ side, width, onResize, children }: ResizablePanelProps) {
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    const onMove = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - startXRef.current;
      const next = side === "left" ? startWidthRef.current + dx : startWidthRef.current - dx;
      onResize(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <aside className={`panel panel-${side}`} style={{ width }}>
      <div className="panel-resize-handle" onPointerDown={onPointerDown} />
      <div className="panel-body">{children}</div>
    </aside>
  );
}
