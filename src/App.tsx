import { WorkspaceProvider } from "./state/workspace";
import { Shell } from "./shell/Shell";

function App() {
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

export default App;
