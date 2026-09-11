import { useEffect, useState } from "react";
import type { RecentDocument } from "../platform/db";
import { useWorkspace } from "../state/workspace";

function formatDate(ts: number | null): string {
  if (ts == null) return "";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function HomeView() {
  const ws = useWorkspace();
  const [recent, setRecent] = useState<RecentDocument[]>([]);

  useEffect(() => {
    let cancelled = false;
    void ws.refreshRecent().then((docs) => {
      if (!cancelled) setRecent(docs);
    });
    return () => {
      cancelled = true;
    };
  }, [ws]);

  return (
    <div className="home">
      <div className="home-inner">
        <div className="home-header">
          <h1>Relax Note</h1>
          <p>A calm place to read and annotate PDFs.</p>
          <button type="button" className="home-open" onClick={() => void ws.openFromDialog()}>
            Open PDF…
          </button>
        </div>

        <section className="home-section">
          <h2>Recent Documents</h2>
          {recent.length === 0 ? (
            <p className="panel-empty">No recent documents yet.</p>
          ) : (
            <div className="recent-grid">
              {recent.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  className="recent-card"
                  onClick={() => void ws.openPath(doc.path)}
                >
                  <div className="recent-title">{doc.title}</div>
                  <div className="recent-meta">
                    Page {doc.lastPage}
                    {doc.pageCount ? ` of ${doc.pageCount}` : ""}
                  </div>
                  <div className="recent-meta">{formatDate(doc.lastOpenedAt)}</div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
