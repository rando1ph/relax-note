import { WorkspaceProvider } from "./state/workspace";
import { AnnotationProvider } from "./state/annotations";
import { Shell } from "./shell/Shell";

function App() {
  return (
    <WorkspaceProvider>
      <AnnotationProvider>
        <Shell />
      </AnnotationProvider>
    </WorkspaceProvider>
  );
}

export default App;
