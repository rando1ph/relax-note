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
import type { Annotation } from "../annotations/types";
import type { SelectionSnapshot } from "../annotations/selection";
import {
  ensureVocabularyRows,
  loadVocabulary,
  updateVocabularyEnrichment,
  updateVocabularyLocal,
} from "../platform/db";
import type { LoadedVocabulary } from "../platform/db";
import { useAnnotations } from "./annotations";
import { useWorkspace } from "./workspace";
import { emptyEnrichment } from "../vocabulary/types";
import type {
  VocabularyContextPayload,
  VocabularyEnrichment,
  VocabularyFields,
  VocabularyItem,
} from "../vocabulary/types";
import { buildVocabularyItems, synthesizeVocabularyLocal } from "../vocabulary/items";
import { shouldEnrich } from "../vocabulary/autoEnrich";
import {
  extractVocabularyContext,
  termOnlyVocabularyContext,
} from "../vocabulary/context";
import { VOCABULARY_PROMPT_VERSION } from "../vocabulary/prompt";
import { requestVocabularyEnrichment } from "../vocabulary/repair";
import { createRequestGate } from "../vocabulary/requestGate";
import { applyEnrichmentEvent } from "../vocabulary/enrichmentMachine";
import { createOpenAiCompatibleProvider } from "../ai/openaiCompatible";
import { tauriAiTransport } from "../ai/rustTransport";
import { isAiConfigured, loadAiSettings, DEFAULT_AI_SETTINGS } from "../ai/settings";
import type { AiSettings } from "../ai/settings";
import { debugAi, endpointHost } from "../ai/debug";
import { getOutlineCached, headingForPage } from "../pdf/outline";

export interface VocabularyStore {
  items: VocabularyItem[];
  loading: boolean;
  settings: AiSettings;
  configured: boolean;
  isRunning: (annotationId: string) => boolean;
  createVocabulary: (snapshot: SelectionSnapshot) => Promise<Annotation | null>;
  enrich: (annotationId: string) => void;
  retry: (annotationId: string) => void;
  regenerate: (annotationId: string) => void;
  updateFields: (annotationId: string, patch: Partial<VocabularyFields>) => void;
  deleteVocabulary: (annotationId: string) => void;
  reloadSettings: () => Promise<void>;
  flush: () => void;
}

const VocabularyContext = createContext<VocabularyStore | null>(null);

function friendlyEnrichmentError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Enrichment failed";
}

export function VocabularyProvider({ children }: { children: ReactNode }) {
  const ws = useWorkspace();
  const annotations = useAnnotations();
  const documentId = ws.activeTab?.id ?? null;

  const [metadata, setMetadata] = useState<Map<string, LoadedVocabulary>>(new Map());
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [running, setRunning] = useState<Record<string, string>>({});

  const annotationsRef = useRef(annotations.annotations);
  annotationsRef.current = annotations.annotations;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;
  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;

  const gateRef = useRef(createRequestGate());
  const inFlightRef = useRef<Map<string, string>>(new Map());
  const fieldTimersRef = useRef<Map<string, number>>(new Map());
  const pendingFieldsRef = useRef<Map<string, Partial<VocabularyFields>>>(new Map());

  // ---- settings ----------------------------------------------------------
  const reloadSettings = useCallback(async () => {
    const loaded = await loadAiSettings();
    setSettings(loaded);
  }, []);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  // ---- load / document switch -------------------------------------------
  useEffect(() => {
    gateRef.current.bumpEpoch();
    for (const requestId of inFlightRef.current.values()) {
      void tauriAiTransport.cancel(requestId).catch(() => undefined);
    }
    inFlightRef.current.clear();
    setRunning({});

    if (!documentId) {
      setMetadata(new Map());
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void loadVocabulary(documentId).then((loaded) => {
      if (cancelled || documentIdRef.current !== documentId) return;
      setMetadata(loaded);
      setLoading(false);
      // Lazily repair any vocabulary annotation missing its metadata rows.
      for (const annotation of annotationsRef.current) {
        if (annotation.type === "vocabulary" && !loaded.has(annotation.id)) {
          void ensureVocabularyRows(
            annotation.id,
            annotation.sourceText,
            annotation.createdAt,
          ).catch(() => undefined);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // ---- field write batching ---------------------------------------------
  const flushFields = useCallback((annotationId: string) => {
    const timer = fieldTimersRef.current.get(annotationId);
    if (timer != null) {
      window.clearTimeout(timer);
      fieldTimersRef.current.delete(annotationId);
    }
    const patch = pendingFieldsRef.current.get(annotationId);
    pendingFieldsRef.current.delete(annotationId);
    if (!patch) return;
    void updateVocabularyEnrichment(annotationId, {
      fields: patch,
      userEdited: true,
    }).catch((error) => console.warn("Failed to save vocabulary fields:", error));
  }, []);

  const flush = useCallback(() => {
    for (const annotationId of [...pendingFieldsRef.current.keys()]) {
      flushFields(annotationId);
    }
  }, [flushFields]);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  // ---- enrichment --------------------------------------------------------
  const persistEnrichment = useCallback(
    (annotationId: string, next: VocabularyEnrichment) => {
      const annotation = annotationsRef.current.find((a) => a.id === annotationId);
      setMetadata((prev) => {
        const updated = new Map(prev);
        const entry = updated.get(annotationId);
        const local = entry?.local ?? (annotation ? synthesizeVocabularyLocal(annotation) : null);
        if (!local) return prev;
        updated.set(annotationId, { local, enrichment: next });
        return updated;
      });
    },
    [],
  );

  const runEnrichment = useCallback(
    async (annotation: Annotation, initialEnrichment: VocabularyEnrichment) => {
      const annotationId = annotation.id;
      const activeSettings = settingsRef.current;
      if (!isAiConfigured(activeSettings)) return;
      const docId = annotation.documentId;
      const pdfDocument = ws.getDocumentProxy(docId);
      if (!pdfDocument) return;
      const firstSegment = annotation.segments[0];
      if (!firstSegment) return;

      const token = gateRef.current.begin(annotationId);
      const requestId = `${annotationId}:${token.generation}`;

      const previous = inFlightRef.current.get(annotationId);
      if (previous) {
        void tauriAiTransport.cancel(previous).catch(() => undefined);
      }
      inFlightRef.current.set(annotationId, requestId);
      setRunning((prev) => ({ ...prev, [annotationId]: requestId }));
      debugAi("enrich:start", {
        annotationId,
        requestId,
        generation: token.generation,
        configured: true,
        autoEnrich: activeSettings.autoEnrich,
        host: endpointHost(activeSettings.baseUrl),
      });

      const finish = () => {
        if (inFlightRef.current.get(annotationId) === requestId) {
          inFlightRef.current.delete(annotationId);
          setRunning((prev) => {
            if (prev[annotationId] !== requestId) return prev;
            const next = { ...prev };
            delete next[annotationId];
            return next;
          });
        }
      };

      try {
        const pageNumber = firstSegment.pageNumber;
        const documentTitle = ws.activeTab?.title ?? "";
        let payload: VocabularyContextPayload;
        try {
          const page = await pdfDocument.getPage(pageNumber);
          const outline = await getOutlineCached(pdfDocument).catch(() => []);
          const sectionHeading = headingForPage(outline, pageNumber);
          payload = await extractVocabularyContext({
            page,
            pageNumber,
            sourceText: annotation.sourceText,
            rects: annotation.segments.map((segment) => segment.rect),
            documentTitle,
            sectionHeading,
          });
        } catch {
          // Context is optional enrichment; the selected term is required.
          payload = termOnlyVocabularyContext(
            annotation.sourceText,
            documentTitle,
            pageNumber,
            null,
          );
        }
        if (!payload.selectedTerm.trim()) {
          payload = { ...payload, selectedTerm: annotation.sourceText.trim() };
        }
        if (!payload.selectedTerm) {
          throw new Error("This vocabulary item has no selected term");
        }
        debugAi("enrich:payload", {
          selectedTerm: payload.selectedTerm,
          hasSourceSentence: Boolean(payload.sourceSentence),
          contextWindowLength: payload.contextWindow.length,
        });
        if (!gateRef.current.isCurrent(token)) return;

        await updateVocabularyLocal(annotationId, {
          sourceSentence: payload.sourceSentence ?? "",
          contextBefore: payload.previousSentence ?? "",
          contextAfter: payload.nextSentence ?? "",
          sectionHeading: payload.sectionHeading,
        }).catch(() => undefined);
        if (!gateRef.current.isCurrent(token)) return;
        setMetadata((prev) => {
          const updated = new Map(prev);
          const entry = updated.get(annotationId);
          updated.set(annotationId, {
            local: {
              annotationId,
              sourceSentence: payload.sourceSentence ?? "",
              contextBefore: payload.previousSentence ?? "",
              contextAfter: payload.nextSentence ?? "",
              sectionHeading: payload.sectionHeading,
              createdAt: entry?.local.createdAt ?? annotation.createdAt,
            },
            enrichment: entry?.enrichment ?? emptyEnrichment(),
          });
          return updated;
        });

        const provider = createOpenAiCompatibleProvider({
          baseUrl: activeSettings.baseUrl,
          model: activeSettings.model,
          jsonMode: activeSettings.jsonMode,
        });
        const result = await requestVocabularyEnrichment(
          (messages) =>
            provider.chat({
              model: activeSettings.model,
              messages,
              temperature: 0,
              // Reduced schema (7 short fields). 256 leaves generous room for a
              // technical term plus valid JSON without risking truncation.
              maxTokens: 256,
              jsonMode: activeSettings.jsonMode,
              requestId,
            }),
          payload,
        );
        if (!gateRef.current.isCurrent(token)) return;

        const generatedAt = Date.now();
        const current =
          metadataRef.current.get(annotationId)?.enrichment ?? initialEnrichment;
        const next = applyEnrichmentEvent(current, {
          type: "success",
          fields: result.fields,
          model: result.model || activeSettings.model,
          promptVersion: VOCABULARY_PROMPT_VERSION,
          generatedAt,
        });
        await updateVocabularyEnrichment(annotationId, {
          status: next.status,
          fields: next.fields,
          model: next.provenance.model,
          promptVersion: next.provenance.promptVersion,
          generatedAt: next.provenance.generatedAt,
          errorMessage: null,
        });
        if (!gateRef.current.isCurrent(token)) return;
        persistEnrichment(annotationId, next);
        debugAi("enrich:ready", {
          annotationId,
          requestId,
          generation: token.generation,
          repaired: result.repaired,
        });
      } catch (error) {
        if (!gateRef.current.isCurrent(token)) return;
        const message = friendlyEnrichmentError(error);
        const current =
          metadataRef.current.get(annotationId)?.enrichment ?? initialEnrichment;
        const next = applyEnrichmentEvent(current, {
          type: "failure",
          error: message,
          at: Date.now(),
        });
        await updateVocabularyEnrichment(annotationId, {
          status: next.status,
          errorMessage: next.errorMessage,
        }).catch(() => undefined);
        if (!gateRef.current.isCurrent(token)) return;
        persistEnrichment(annotationId, next);
        debugAi("enrich:failed", {
          annotationId,
          requestId,
          generation: token.generation,
          error: message,
        });
      } finally {
        finish();
      }
    },
    [persistEnrichment, ws],
  );

  const enrich = useCallback(
    (annotationId: string) => {
      const annotation = annotationsRef.current.find((a) => a.id === annotationId);
      if (!annotation || annotation.type !== "vocabulary") return;
      const current =
        metadataRef.current.get(annotationId)?.enrichment ?? emptyEnrichment();
      void runEnrichment(annotation, current);
    },
    [runEnrichment],
  );

  const createVocabulary = useCallback(
    async (snapshot: SelectionSnapshot): Promise<Annotation | null> => {
      const annotation = await annotations.createVocabulary(snapshot);
      if (!annotation) return null;
      const initialEnrichment = emptyEnrichment();
      setMetadata((prev) => {
        const updated = new Map(prev);
        updated.set(annotation.id, {
          local: synthesizeVocabularyLocal(annotation),
          enrichment: initialEnrichment,
        });
        return updated;
      });
      const config = {
        configured: isAiConfigured(settingsRef.current),
        autoEnrich: settingsRef.current.autoEnrich,
      };
      debugAi("create", {
        annotationId: annotation.id,
        configured: config.configured,
        autoEnrich: config.autoEnrich,
        host: endpointHost(settingsRef.current.baseUrl),
      });
      // Use the freshly created annotation directly: `annotationsRef.current`
      // is not updated until React commits the new annotation, so an id lookup
      // here would miss it.
      if (shouldEnrich("create", config)) {
        void runEnrichment(annotation, initialEnrichment);
      }
      return annotation;
    },
    [annotations, runEnrichment],
  );

  const updateFields = useCallback(
    (annotationId: string, patch: Partial<VocabularyFields>) => {
      setMetadata((prev) => {
        const entry = prev.get(annotationId);
        if (!entry) return prev;
        const updated = new Map(prev);
        updated.set(annotationId, {
          ...entry,
          enrichment: {
            ...entry.enrichment,
            fields: { ...entry.enrichment.fields, ...patch },
            userEdited: true,
            errorMessage: entry.enrichment.errorMessage,
          },
        });
        return updated;
      });
      const merged = { ...pendingFieldsRef.current.get(annotationId), ...patch };
      pendingFieldsRef.current.set(annotationId, merged);
      const existing = fieldTimersRef.current.get(annotationId);
      if (existing != null) window.clearTimeout(existing);
      const timer = window.setTimeout(() => flushFields(annotationId), 400);
      fieldTimersRef.current.set(annotationId, timer);
    },
    [flushFields],
  );

  const deleteVocabulary = useCallback(
    (annotationId: string) => {
      gateRef.current.tombstone(annotationId);
      const requestId = inFlightRef.current.get(annotationId);
      if (requestId) {
        void tauriAiTransport.cancel(requestId).catch(() => undefined);
        inFlightRef.current.delete(annotationId);
      }
      setRunning((prev) => {
        if (!(annotationId in prev)) return prev;
        const next = { ...prev };
        delete next[annotationId];
        return next;
      });
      setMetadata((prev) => {
        const updated = new Map(prev);
        updated.delete(annotationId);
        return updated;
      });
      annotations.deleteAnnotation(annotationId);
    },
    [annotations],
  );

  const items = useMemo<VocabularyItem[]>(
    () => buildVocabularyItems(annotations.annotations, metadata),
    [annotations.annotations, metadata],
  );

  const isRunning = useCallback(
    (annotationId: string) => annotationId in running,
    [running],
  );

  const value = useMemo<VocabularyStore>(
    () => ({
      items,
      loading,
      settings,
      configured: isAiConfigured(settings),
      isRunning,
      createVocabulary,
      enrich: (id) => void enrich(id),
      retry: (id) => void enrich(id),
      regenerate: (id) => void enrich(id),
      updateFields,
      deleteVocabulary,
      reloadSettings,
      flush,
    }),
    [
      items,
      loading,
      settings,
      isRunning,
      createVocabulary,
      enrich,
      updateFields,
      deleteVocabulary,
      reloadSettings,
      flush,
    ],
  );

  return (
    <VocabularyContext.Provider value={value}>{children}</VocabularyContext.Provider>
  );
}

export function useVocabulary(): VocabularyStore {
  const ctx = useContext(VocabularyContext);
  if (!ctx) throw new Error("useVocabulary must be used within a VocabularyProvider");
  return ctx;
}
