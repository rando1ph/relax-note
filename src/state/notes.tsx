import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createWriteQueue } from "../annotations/writeQueue";
import type { WriteQueue } from "../annotations/writeQueue";
import {
  createPageNote as dbCreatePageNote,
  deletePageNote as dbDeletePageNote,
  loadPageNotes,
  updatePageNote as dbUpdatePageNote,
} from "../platform/db";
import type { PageNotePatch } from "../platform/db";
import { deriveNoteList, isBlankPageNote } from "../notes/items";
import { sameNote } from "../notes/selection";
import type { NoteListItem, NoteSelection, PageNote } from "../notes/types";
import { useAnnotations } from "./annotations";
import { useWorkspace } from "./workspace";

export interface NotesStore {
  items: NoteListItem[];
  loading: boolean;
  selected: NoteSelection | null;
  selectAnnotationNote: (id: string) => void;
  selectPageNote: (id: string) => void;
  createPageNote: () => Promise<PageNote | null>;
  createTutorPageNote: (input: {
    pageNumber: number;
    title: string | null;
    note: string;
  }) => Promise<PageNote | null>;
  updateTitle: (selection: NoteSelection, title: string | null) => void;
  updateNote: (selection: NoteSelection, note: string) => void;
  deletePageNote: (id: string) => void;
  deleteAnnotationNote: (id: string) => void;
  flush: () => void;
}

const NotesContext = createContext<NotesStore | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  const ws = useWorkspace();
  const annotations = useAnnotations();
  const documentId = ws.activeTab?.id ?? null;

  const [pageNotes, setPageNotes] = useState<PageNote[]>([]);
  const [selected, setSelected] = useState<NoteSelection | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedByDoc = useRef<Map<string, NoteSelection | null>>(new Map());
  const queueRef = useRef<WriteQueue | null>(null);
  const loadGeneration = useRef(0);
  const currentDocRef = useRef<string | null>(null);
  const pageNotesRef = useRef<PageNote[]>([]);
  pageNotesRef.current = pageNotes;

  // ---- per-page-note serialized write queue ---------------------------------
  if (queueRef.current == null) {
    queueRef.current = createWriteQueue({
      debounceMs: 400,
      persist: (id, patch) => dbUpdatePageNote(id, patch as PageNotePatch),
    });
  }

  const flush = useCallback(() => {
    queueRef.current?.flushAll();
    annotations.flushPending();
  }, [annotations]);

  // ---- load / document switch ----------------------------------------------
  useEffect(() => {
    currentDocRef.current = documentId;
    const generation = ++loadGeneration.current;

    if (!documentId) {
      setPageNotes([]);
      setSelected(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setPageNotes([]);
    setSelected(selectedByDoc.current.get(documentId) ?? null);

    let cancelled = false;
    void loadPageNotes(documentId).then((loaded) => {
      if (cancelled) return;
      if (generation !== loadGeneration.current || currentDocRef.current !== documentId) {
        return;
      }
      setPageNotes(loaded);
      setSelected(selectedByDoc.current.get(documentId) ?? null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Flush pending page-note writes when switching documents or unmounting.
  const prevDocRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevDocRef.current && prevDocRef.current !== documentId) {
      flush();
    }
    prevDocRef.current = documentId;
  }, [documentId, flush]);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  // ---- derived items --------------------------------------------------------
  const items = useMemo(
    () => deriveNoteList(annotations.annotations, pageNotes),
    [annotations.annotations, pageNotes],
  );

  // ---- selection ------------------------------------------------------------
  const setSelection = useCallback((next: NoteSelection | null) => {
    const docId = currentDocRef.current;
    if (docId) selectedByDoc.current.set(docId, next);
    setSelected(next);
  }, []);

  const selectAnnotationNote = useCallback(
    (id: string) => {
      setSelection({ kind: "annotation", id });
      annotations.select(id);
    },
    [setSelection, annotations],
  );

  const selectPageNote = useCallback(
    (id: string) => {
      setSelection({ kind: "page", id });
    },
    [setSelection],
  );

  // If the selected note no longer exists (cleared/deleted/purged), fall back
  // safely to null rather than pointing at a dead item. Gated on `loading` so a
  // transient empty list during a document switch never clears a restored
  // selection prematurely.
  useEffect(() => {
    if (loading || !selected) return;
    const exists = items.some((item) => sameNote(item.selection, selected));
    if (!exists) {
      setSelection(null);
    }
  }, [items, selected, loading, setSelection]);

  // ---- actions --------------------------------------------------------------
  const createPageNote = useCallback(async (): Promise<PageNote | null> => {
    const docId = currentDocRef.current;
    if (!docId) return null;
    const pageNumber = ws.activeTab?.readerState.currentPage ?? 1;

    // Reuse only a blank draft anchored to this same page (never an arbitrary
    // blank row elsewhere in the document).
    const existing = pageNotesRef.current.find(
      (p) => isBlankPageNote(p) && p.pageNumber === pageNumber,
    );
    if (existing) {
      setSelection({ kind: "page", id: existing.id });
      return existing;
    }

    const now = Date.now();
    const draft: PageNote = {
      id: crypto.randomUUID(),
      documentId: docId,
      pageNumber,
      title: null,
      note: "",
      createdAt: now,
      updatedAt: now,
      origin: "user",
    };

    try {
      await dbCreatePageNote(draft);
    } catch (error) {
      console.warn("Failed to create page note:", error);
      return null;
    }

    if (currentDocRef.current !== docId) return null;

    // Any other blank/untitled draft is now abandoned: tombstone + delete so it
    // cannot be resurrected by a stale write and does not linger as junk.
    const abandoned = pageNotesRef.current.filter(
      (p) => isBlankPageNote(p) && p.id !== draft.id,
    );
    for (const p of abandoned) {
      queueRef.current?.markDeleted(p.id);
      void dbDeletePageNote(p.id).catch(() => undefined);
    }

    setPageNotes((prev) => [...prev.filter((p) => !abandoned.some((a) => a.id === p.id)), draft]);
    setSelection({ kind: "page", id: draft.id });
    return draft;
  }, [ws, setSelection]);

  /**
   * Creates a page note on a specific page (used by AI Tutor's "Save to Page
   * Note"). It never changes the current selection or the viewer page, so the
   * note is anchored to the message's frozen snapshot page, not the live page.
   */
  const createTutorPageNote = useCallback(
    async (input: {
      pageNumber: number;
      title: string | null;
      note: string;
    }): Promise<PageNote | null> => {
      const docId = currentDocRef.current;
      if (!docId) return null;

      const now = Date.now();
      const pageNote: PageNote = {
        id: crypto.randomUUID(),
        documentId: docId,
        pageNumber: Math.max(1, Math.round(input.pageNumber)),
        title: input.title,
        note: input.note,
        createdAt: now,
        updatedAt: now,
        origin: "ai_tutor",
      };

      try {
        await dbCreatePageNote(pageNote);
      } catch (error) {
        console.warn("Failed to create AI Tutor page note:", error);
        return null;
      }

      if (currentDocRef.current !== docId) return null;
      setPageNotes((prev) => [...prev, pageNote]);
      return pageNote;
    },
    [],
  );

  const updatePageNote = useCallback((id: string, patch: PageNotePatch) => {
    setPageNotes((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
    );
    queueRef.current?.schedule(id, patch as Record<string, unknown>);
  }, []);

  const updateTitle = useCallback(
    (selection: NoteSelection, title: string | null) => {
      if (selection.kind === "annotation") {
        annotations.updateAnnotation(selection.id, { title: title || null });
      } else {
        updatePageNote(selection.id, { title });
      }
    },
    [annotations, updatePageNote],
  );

  const updateNote = useCallback(
    (selection: NoteSelection, note: string) => {
      if (selection.kind === "annotation") {
        annotations.updateAnnotation(selection.id, { note });
      } else {
        updatePageNote(selection.id, { note });
      }
    },
    [annotations, updatePageNote],
  );

  const deletePageNote = useCallback((id: string) => {
    queueRef.current?.markDeleted(id);
    setPageNotes((prev) => prev.filter((p) => p.id !== id));
    void dbDeletePageNote(id).catch((error) => {
      console.warn("Failed to delete page note:", error);
    });
  }, []);

  const deleteAnnotationNote = useCallback(
    (id: string) => {
      // Delete the user-authored Note (title + body) while preserving the
      // annotation itself: type, color, source text and geometry are untouched.
      // The annotation write queue coalesces any older pending/in-flight title
      // or note autosave so this final { title: null, note: "" } wins and
      // cannot be resurrected by a stale write.
      annotations.updateAnnotation(id, { title: null, note: "" });
      annotations.flushPending();
    },
    [annotations],
  );

  const value = useMemo<NotesStore>(
    () => ({
      items,
      loading,
      selected,
      selectAnnotationNote,
      selectPageNote,
      createPageNote,
      createTutorPageNote,
      updateTitle,
      updateNote,
      deletePageNote,
      deleteAnnotationNote,
      flush,
    }),
    [
      items,
      loading,
      selected,
      selectAnnotationNote,
      selectPageNote,
      createPageNote,
      createTutorPageNote,
      updateTitle,
      updateNote,
      deletePageNote,
      deleteAnnotationNote,
      flush,
    ],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes(): NotesStore {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes must be used within a NotesProvider");
  return ctx;
}
