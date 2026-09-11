import { useWorkspace } from "../state/workspace";

export function TabBar() {
  const ws = useWorkspace();

  return (
    <div className="tabbar">
      <button
        type="button"
        className={ws.activeTab === null ? "tab home-tab active" : "tab home-tab"}
        onClick={ws.showHome}
      >
        Home
      </button>

      {ws.tabs.map((tab) => (
        <div key={tab.id} className="tab-wrap">
          <button
            type="button"
            className={ws.activeTab?.id === tab.id ? "tab active" : "tab"}
            onClick={() => ws.activateTab(tab.id)}
            title={tab.path}
          >
            {tab.status === "loading" ? "Loading…" : tab.title}
          </button>
          <button
            type="button"
            className="tab-close"
            onClick={() => ws.closeTab(tab.id)}
            aria-label={`Close ${tab.title}`}
          >
            ×
          </button>
        </div>
      ))}

      <button type="button" className="tab new-tab" onClick={() => void ws.openFromDialog()}>
        +
      </button>
    </div>
  );
}
