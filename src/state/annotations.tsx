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
import type {
  Annotation,
  AnnotationEditablePatch,
  AnnotationType,
} from "../annotations/types";
import type { SelectionSnapshot } from "../annotations/selection";
import { loadLastUsedColor, saveLastUsedColor } from "../annotations/colorPreference";
import {
  createAnnotation as dbCreateAnnotation,
  deleteAnnotation as dbDeleteAnnotation,
  ensureVocabularyRows,
  loadAnnotations,
  updateAnnotation as dbUpdateAnnotation,
} from "../platform/db";
import { createWriteQueue } from "../annotations/writeQueue";
import type { WriteQueue } from "../annotations/writeQueue";
import { useWorkspace } from "./workspace";

export interface AnnotationStore {
  annotations: Annotation[];
  selectedId: string | null;
  byPage: Map<number, Annotation[]>;
  loading: boolean;
  select: (id: string | null) => void;
  createHighlight: (snapshot: SelectionSnapshot) => Promise<Annotation | null>;
  createVocabulary: (snapshot: SelectionSnapshot) => Promise<Annotation | null>;
  updateAnnotation: (id: string, patch: AnnotationEditablePatch) => void;
  deleteAnnotation: (id: string) => void;
  flushPending: () => void;
}

const AnnotationContext = createContext<AnnotationStore | null>(null);

function sortKey(a: Annotation): [number, number] {
  const first = a.segments[0];
  return [first?.pageNumber ?? 1, first?.seq ?? 0];
}

export function AnnotationProvider({ children }: { children: ReactNode }) {
  const ws = useWorkspace();
  const documentId = ws.activeTab?.id ?? null;

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedByDoc = useRef<Map<string, string | null>>(new Map());
  const queueRef = useRef<WriteQueue | null>(null);
  const loadGeneration = useRef(0);
  const currentDocRef = useRef<string | null>(null);

  // ---- per-annotation serialized write queue ------------------------------
  if (queueRef.current == null) {
    queueRef.current = createWriteQueue({
      debounceMs: 400,
      persist: (id, patch) => dbUpdateAnnotation(id, patch as AnnotationEditablePatch),
    });
  }

  const schedulePersist = useCallback((id: string, patch: AnnotationEditablePatch) => {
    queueRef.current?.schedule(id, patch as Record<string, unknown>);
  }, []);

  const flushPending = useCallback(() => {
    queueRef.current?.flushAll();
  }, []);

  // ---- load / document switch --------------------------------------------

  useEffect(() => {
    currentDocRef.current = documentId;
    const generation = ++loadGeneration.current;

    if (!documentId) {
      setAnnotations([]);
      setSelectedId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setAnnotations([]);
    setSelectedId(selectedByDoc.current.get(documentId) ?? null);

    let cancelled = false;
    void loadAnnotations(documentId).then((loaded) => {
      if (cancelled) return;
      if (generation !== loadGeneration.current || currentDocRef.current !== documentId) {
        return;
      }
      setAnnotations(loaded);
      setSelectedId(selectedByDoc.current.get(documentId) ?? null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Flush pending edits when switching away from a document or unmounting.
  const prevDocRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevDocRef.current && prevDocRef.current !== documentId) {
      flushPending();
    }
    prevDocRef.current = documentId;
  }, [documentId, flushPending]);

  useEffect(() => {
    return () => {
      flushPending();
    };
  }, [flushPending]);

  // ---- actions ------------------------------------------------------------

  const select = useCallback(
    (id: string | null) => {
      if (currentDocRef.current) {
        selectedByDoc.current.set(currentDocRef.current, id);
      }
      setSelectedId(id);
    },
    [],
  );

  const createAnnotationOfType = useCallback(
    async (type: AnnotationType, snapshot: SelectionSnapshot): Promise<Annotation | null> => {
      const docId = currentDocRef.current;
      if (!docId) return null;

      const now = Date.now();
      const annotation: Annotation = {
        id: crypto.randomUUID(),
        documentId: docId,
        type,
        color: loadLastUsedColor(),
        sourceText: snapshot.text,
        title: null,
        note: "",
        createdAt: now,
        updatedAt: now,
        segments: snapshot.rects.map((rect, i) => ({
          pageNumber: snapshot.pageNumber,
          rect,
          seq: i,
        })),
      };

      try {
        await dbCreateAnnotation({
          id: annotation.id,
          documentId: annotation.documentId,
          type: annotation.type,
          color: annotation.color,
          sourceText: annotation.sourceText,
          title: annotation.title,
          note: annotation.note,
          createdAt: annotation.createdAt,
          updatedAt: annotation.updatedAt,
          segments: annotation.segments,
        });
        if (type === "vocabulary") {
          // Idempotent and best-effort: a missing metadata row never invalidates
          // the authoritative annotation.
          await ensureVocabularyRows(
            annotation.id,
            annotation.sourceText,
            annotation.createdAt,
          ).catch(() => undefined);
        }
      } catch (error) {
        console.warn("Failed to create annotation:", error);
        return null;
      }

      if (currentDocRef.current !== docId) {
        return null;
      }

      setAnnotations((prev) => [...prev, annotation].sort((a, b) => {
        const [pa, sa] = sortKey(a);
        const [pb, sb] = sortKey(b);
        return pa - pb || sa - sb || a.createdAt - b.createdAt;
      }));
      selectedByDoc.current.set(docId, annotation.id);
      setSelectedId(annotation.id);
      return annotation;
    },
    [],
  );

  const createHighlight = useCallback(
    (snapshot: SelectionSnapshot) => createAnnotationOfType("highlight", snapshot),
    [createAnnotationOfType],
  );

  const createVocabulary = useCallback(
    (snapshot: SelectionSnapshot) => createAnnotationOfType("vocabulary", snapshot),
    [createAnnotationOfType],
  );

  const updateAnnotation = useCallback(
    (id: string, patch: AnnotationEditablePatch) => {
      if (patch.color !== undefined) {
        saveLastUsedColor(patch.color);
      }
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a)),
      );
      schedulePersist(id, patch);
    },
    [schedulePersist],
  );

  const deleteAnnotation = useCallback(
    (id: string) => {
      queueRef.current?.markDeleted(id);

      setAnnotations((prev) => prev.filter((a) => a.id !== id));
      if (currentDocRef.current && selectedByDoc.current.get(currentDocRef.current) === id) {
        selectedByDoc.current.set(currentDocRef.current, null);
        setSelectedId(null);
      }

      void dbDeleteAnnotation(id).catch((error) => {
        console.warn("Failed to delete annotation:", error);
      });
    },
    [],
  );

  const byPage = useMemo(() => {
    const map = new Map<number, Annotation[]>();
    for (const annotation of annotations) {
      for (const segment of annotation.segments) {
        const list = map.get(segment.pageNumber);
        if (list) list.push(annotation);
        else map.set(segment.pageNumber, [annotation]);
      }
    }
    return map;
  }, [annotations]);

  const value = useMemo<AnnotationStore>(
    () => ({
      annotations,
      selectedId,
      byPage,
      loading,
      select,
      createHighlight,
      createVocabulary,
      updateAnnotation,
      deleteAnnotation,
      flushPending,
    }),
    [
      annotations,
      selectedId,
      byPage,
      loading,
      select,
      createHighlight,
      createVocabulary,
      updateAnnotation,
      deleteAnnotation,
      flushPending,
    ],
  );

  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
}

export function useAnnotations(): AnnotationStore {
  const ctx = useContext(AnnotationContext);
  if (!ctx) throw new Error("useAnnotations must be used within an AnnotationProvider");
  return ctx;
}
