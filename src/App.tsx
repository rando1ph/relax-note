import { WorkspaceProvider } from "./state/workspace";
import { AiSettingsProvider } from "./state/aiSettings";
import { AnnotationProvider } from "./state/annotations";
import { VocabularyProvider } from "./state/vocabulary";
import { NotesProvider } from "./state/notes";
import { TutorProvider } from "./state/tutor";
import { Shell } from "./shell/Shell";

function App() {
  return (
    <AiSettingsProvider>
      <WorkspaceProvider>
        <AnnotationProvider>
          <NotesProvider>
            <VocabularyProvider>
              <TutorProvider>
                <Shell />
              </TutorProvider>
            </VocabularyProvider>
          </NotesProvider>
        </AnnotationProvider>
      </WorkspaceProvider>
    </AiSettingsProvider>
  );
}

export default App;
