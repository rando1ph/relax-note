import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "../pdf/pdfjs";
import { getOutline } from "../pdf/outline";
import type { OutlineItem } from "../pdf/outline";

interface OutlinePanelProps {
  pdfDocument: PDFDocumentProxy;
  onNavigate: (page: number) => void;
}

function OutlineTree({
  items,
  depth,
  onNavigate,
}: {
  items: OutlineItem[];
  depth: number;
  onNavigate: (page: number) => void;
}) {
  return (
    <ul className="outline-list">
      {items.map((item, i) => (
        <li key={`${depth}-${i}`}>
          <button
            type="button"
            className="outline-item"
            style={{ paddingLeft: 8 + depth * 14 }}
            disabled={item.pageNumber == null}
            onClick={() => item.pageNumber != null && onNavigate(item.pageNumber)}
          >
            {item.title}
          </button>
          {item.children.length > 0 ? (
            <OutlineTree items={item.children} depth={depth + 1} onNavigate={onNavigate} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function OutlinePanel({ pdfDocument, onNavigate }: OutlinePanelProps) {
  const [items, setItems] = useState<OutlineItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    getOutline(pdfDocument).then((result) => {
      if (!cancelled) setItems(result);
    });
    return () => {
      cancelled = true;
    };
  }, [pdfDocument]);

  if (items === null) {
    return <div className="panel-empty">Loading outline…</div>;
  }
  if (items.length === 0) {
    return <div className="panel-empty">This PDF has no outline.</div>;
  }
  return <OutlineTree items={items} depth={0} onNavigate={onNavigate} />;
}
