import { WorkspaceProvider } from "./state/workspace";
import { AnnotationProvider } from "./state/annotations";
import { VocabularyProvider } from "./state/vocabulary";
import { Shell } from "./shell/Shell";

function App() {
  return (
    <WorkspaceProvider>
      <AnnotationProvider>
        <VocabularyProvider>
          <Shell />
        </VocabularyProvider>
      </AnnotationProvider>
    </WorkspaceProvider>
  );
}

export default App;
