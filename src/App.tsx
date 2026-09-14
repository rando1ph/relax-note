import { WorkspaceProvider } from "./state/workspace";
import { AnnotationProvider } from "./state/annotations";
import { VocabularyProvider } from "./state/vocabulary";
import { NotesProvider } from "./state/notes";
import { Shell } from "./shell/Shell";

function App() {
  return (
    <WorkspaceProvider>
      <AnnotationProvider>
        <NotesProvider>
          <VocabularyProvider>
            <Shell />
          </VocabularyProvider>
        </NotesProvider>
      </AnnotationProvider>
    </WorkspaceProvider>
  );
}

export default App;
