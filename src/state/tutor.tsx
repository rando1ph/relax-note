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
import type { AiMessage } from "../ai/types";
import { debugAi } from "../ai/debug";
import type { SelectionSnapshot } from "../annotations/selection";
import { createOpenAiCompatibleProvider } from "../ai/openaiCompatible";
import { createRequestGate } from "../ai/requestGate";
import { tauriAiTransport } from "../ai/rustTransport";
import { isAiConfigured } from "../ai/settings";
import { getOutlineCached, headingForPage } from "../pdf/outline";
import { applyConversationEvent, resolveAnswerChain } from "../tutor/conversation";
import { createTutorContextSnapshot, loadTutorLocalContext } from "../tutor/context";
import {
  annotationContextSeed,
  pageContextSeed,
  pageNoteContextSeed,
  selectionContextSeed,
} from "../tutor/contextInputs";
import type { TutorContextSeed } from "../tutor/contextInputs";
import { contextIdentityKey } from "../tutor/identity";
import {
  planContinuationMessages,
  planNormalMessages,
  planSendMessages,
} from "../tutor/requestPlan";
import {
  TUTOR_MAX_TOKENS,
  TUTOR_TEMPERATURE,
  TUTOR_TIMEOUT_MS,
} from "../tutor/prompt";
import type {
  TutorConversation,
  TutorMessage,
} from "../tutor/types";
import { useAiSettings } from "./aiSettings";
import { useAnnotations } from "./annotations";
import { useNotes } from "./notes";
import { useVocabulary } from "./vocabulary";
import { useWorkspace } from "./workspace";

export interface TutorStore {
  conversation: TutorConversation | null;
  running: boolean;
  configured: boolean;
  draftQuestion: string | null;
  /** Set by a direct Ask AI action; the shell opens the Tutor surface. */
  openRequested: boolean;
  acknowledgeOpen: () => void;
  consumeDraftQuestion: () => string | null;
  attachSelection: (snapshot: SelectionSnapshot) => void;
  attachAnnotation: (annotationId: string) => void;
  attachCurrentPage: () => void;
  /** Direct Ask AI from an annotation / vocabulary inspector. */
  askAnnotation: (annotationId: string) => void;
  /** Direct Ask AI from a standalone Page Note inspector. */
  askPageNote: (pageNoteId: string) => void;
  send: (question: string) => void;
  stop: () => void;
  clear: () => void;
  retry: (assistantId: string) => void;
  continueFrom: (assistantId: string) => void;
  saveToPageNote: (assistantId: string) => void;
}

const TutorContext = createContext<TutorStore | null>(null);

const DEFAULT_ASK_QUESTION = "Explain this passage.";
const DEFAULT_ANNOTATION_QUESTION = "Explain this annotation.";
const DEFAULT_PAGE_NOTE_QUESTION = "Explain this page note.";

type RequestKind = "tutor" | "tutor-continue";

function friendlyTutorError(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (error instanceof Error && error.message) return error.message;
  return "Tutor request failed";
}

function questionExcerpt(question: string): string {
  const line = question.replace(/\s+/g, " ").trim();
  return line.length > 40 ? `${line.slice(0, 39)}…` : line;
}

export function TutorProvider({ children }: { children: ReactNode }) {
  const ws = useWorkspace();
  const annotations = useAnnotations();
  const vocabulary = useVocabulary();
  const notes = useNotes();
  const { settings, configured } = useAiSettings();
  const documentId = ws.activeTab?.id ?? null;

  const [conversations, setConversations] = useState<Map<string, TutorConversation>>(
    new Map(),
  );
  const [running, setRunning] = useState<Record<string, string>>({});
  const [draftQuestion, setDraftQuestion] = useState<string | null>(null);
  const [openRequested, setOpenRequested] = useState(false);

  // Stable refs for values read inside long-running async request flows.
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const annotationsRef = useRef(annotations.annotations);
  annotationsRef.current = annotations.annotations;
  const vocabularyRef = useRef(vocabulary.items);
  vocabularyRef.current = vocabulary.items;
  const notesRef = useRef(notes.items);
  notesRef.current = notes.items;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;
  const createTutorPageNoteRef = useRef(notes.createTutorPageNote);
  createTutorPageNoteRef.current = notes.createTutorPageNote;

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const inFlightRef = useRef<Map<string, string>>(new Map());

  const gateRef = useRef(createRequestGate());
  const cancelledRef = useRef<Set<string>>(new Set());

  const applyEvent = useCallback(
    (event: Parameters<typeof applyConversationEvent>[1]) => {
      const next = applyConversationEvent(conversationsRef.current, event);
      conversationsRef.current = next;
      setConversations(next);
    },
    [],
  );

  // ---- snapshot builder --------------------------------------------------

  const buildSnapshot = useCallback(async (docId: string, seed: TutorContextSeed) => {
    const tab = wsRef.current.tabs.find((t) => t.id === docId);
    const documentTitle = tab?.title ?? "";
    let sectionHeading: string | null = null;
    let localContextWindow = "";

    const pdf = wsRef.current.getDocumentProxy(docId);
    if (pdf) {
      try {
        const page = await pdf.getPage(seed.page);
        const outline = await getOutlineCached(pdf).catch(() => []);
        sectionHeading = headingForPage(outline, seed.page);
        localContextWindow = await loadTutorLocalContext({ page, anchor: seed.anchor });
      } catch {
        // Context is optional; the question + metadata still go through.
      }
    }

    return createTutorContextSnapshot(
      {
        documentId: docId,
        documentTitle,
        page: seed.page,
        source: seed.source,
        sectionHeading,
        selectedText: seed.selectedText,
        annotationSourceText: seed.annotationSourceText,
        noteTitle: seed.noteTitle,
        userNote: seed.userNote,
        noteOrigin: seed.noteOrigin,
        vocabulary: seed.vocabulary,
        identity: seed.identity,
      },
      localContextWindow,
    );
  }, []);

  const captureAndAttach = useCallback(
    async (docId: string, seed: TutorContextSeed): Promise<void> => {
      const snapshot = await buildSnapshot(docId, seed);
      if (documentIdRef.current !== docId) return;

      const key = contextIdentityKey(seed.identity);
      const currentKey = conversationsRef.current.get(docId)?.contextIdentity ?? null;
      const changed = currentKey !== key;
      if (changed) {
        // A genuinely different logical context: cancel/invalidate any in-flight
        // request so a late old response can never appear in the new context.
        const requestId = inFlightRef.current.get(docId);
        if (requestId) {
          cancelledRef.current.add(requestId);
          debugAi("tutor:context-cancel", { requestId, previousIdentity: currentKey });
          void tauriAiTransport.cancel(requestId).catch(() => undefined);
        }
        gateRef.current.invalidate(docId);
      }

      debugAi("tutor:context", {
        source: seed.source,
        identity: key,
        previousIdentity: currentKey,
        historyReset: changed,
        snapshotPage: seed.page,
      });

      applyEvent({ type: "set-context", documentId: docId, context: snapshot, identity: key });
    },
    [buildSnapshot, applyEvent],
  );

  // ---- context attachment / direct Ask AI --------------------------------

  const attachSelection = useCallback(
    (snapshot: SelectionSnapshot) => {
      const docId = documentIdRef.current;
      if (!docId) return;
      setDraftQuestion(DEFAULT_ASK_QUESTION);
      setOpenRequested(true);
      void captureAndAttach(docId, selectionContextSeed(snapshot));
    },
    [captureAndAttach],
  );

  const attachAnnotationWith = useCallback(
    (annotationId: string, mode: { open: boolean; draft: string | null }) => {
      const docId = documentIdRef.current;
      if (!docId) return;
      const annotation = annotationsRef.current.find((a) => a.id === annotationId);
      if (!annotation) return;
      const vocabularyItem =
        vocabularyRef.current.find((v) => v.annotation.id === annotationId) ?? null;
      const seed = annotationContextSeed(annotation, vocabularyItem);
      if (!seed) return;

      if (mode.open) setOpenRequested(true);
      if (mode.draft) setDraftQuestion(mode.draft);
      void captureAndAttach(docId, seed);
    },
    [captureAndAttach],
  );

  const attachAnnotation = useCallback(
    (annotationId: string) => attachAnnotationWith(annotationId, { open: false, draft: null }),
    [attachAnnotationWith],
  );

  const askAnnotation = useCallback(
    (annotationId: string) =>
      attachAnnotationWith(annotationId, { open: true, draft: DEFAULT_ANNOTATION_QUESTION }),
    [attachAnnotationWith],
  );

  const askPageNote = useCallback(
    (pageNoteId: string) => {
      const docId = documentIdRef.current;
      if (!docId) return;
      const item = notesRef.current.find(
        (n) => n.selection.kind === "page" && n.selection.id === pageNoteId,
      );
      if (!item) return;
      const seed = pageNoteContextSeed(item);
      if (!seed) return;
      setOpenRequested(true);
      setDraftQuestion(DEFAULT_PAGE_NOTE_QUESTION);
      void captureAndAttach(docId, seed);
    },
    [captureAndAttach],
  );

  const attachCurrentPage = useCallback(() => {
    const docId = documentIdRef.current;
    if (!docId) return;
    const page = wsRef.current.activeTab?.readerState.currentPage ?? 1;
    void captureAndAttach(docId, pageContextSeed(docId, page));
  }, [captureAndAttach]);

  // ---- request orchestration --------------------------------------------

  const runAssistant = useCallback(
    async (
      docId: string,
      messages: AiMessage[],
      assistantId: string,
      kind: RequestKind,
    ) => {
      const activeSettings = settingsRef.current;
      if (!isAiConfigured(activeSettings)) return;
      if (messages.length === 0) return;

      const token = gateRef.current.begin(docId);
      const requestId = `${docId}:${token.generation}`;

      const previous = inFlightRef.current.get(docId);
      if (previous) void tauriAiTransport.cancel(previous).catch(() => undefined);
      inFlightRef.current.set(docId, requestId);
      setRunning((prev) => ({ ...prev, [docId]: requestId }));

      const finish = () => {
        if (inFlightRef.current.get(docId) === requestId) {
          inFlightRef.current.delete(docId);
          cancelledRef.current.delete(requestId);
          setRunning((prev) => {
            const next = { ...prev };
            delete next[docId];
            return next;
          });
        }
      };

      try {
        debugAi("tutor:start", {
          kind,
          requestId,
          messageCount: messages.length,
          configured: true,
        });
        const provider = createOpenAiCompatibleProvider({
          baseUrl: activeSettings.baseUrl,
          model: activeSettings.model,
          jsonMode: false,
        });
        const result = await provider.chat({
          model: activeSettings.model,
          messages,
          temperature: TUTOR_TEMPERATURE,
          maxTokens: TUTOR_MAX_TOKENS,
          jsonMode: false,
          requestId,
          timeoutMs: TUTOR_TIMEOUT_MS,
        });

        debugAi("tutor:result", {
          kind,
          requestId,
          finishReason: result.finishReason ?? null,
          contentLength: result.content.length,
          model: result.model,
        });

        if (!gateRef.current.isCurrent(token)) {
          debugAi("tutor:stale-drop", { kind, requestId, reason: "complete" });
          return;
        }
        applyEvent({
          type: "complete",
          documentId: docId,
          assistantId,
          content: result.content,
          finishReason: result.finishReason ?? null,
        });
      } catch (error) {
        if (!gateRef.current.isCurrent(token)) {
          debugAi("tutor:stale-drop", { kind, requestId, reason: "error" });
          return;
        }
        if (cancelledRef.current.has(requestId)) {
          applyEvent({ type: "stop", documentId: docId, assistantId });
        } else {
          applyEvent({
            type: "fail",
            documentId: docId,
            assistantId,
            error: friendlyTutorError(error),
          });
        }
      } finally {
        finish();
      }
    },
    [applyEvent],
  );

  const send = useCallback(
    async (question: string) => {
      const docId = documentIdRef.current;
      if (!docId) return;
      const text = question.trim();
      if (!text) return;

      let snapshot = conversationsRef.current.get(docId)?.context ?? null;
      if (!snapshot) {
        // No explicit anchor: default to the current page.
        snapshot = await buildSnapshot(
          docId,
          pageContextSeed(docId, wsRef.current.activeTab?.readerState.currentPage ?? 1),
        );
        if (documentIdRef.current !== docId) return;
      }

      const now = Date.now();
      const userId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();

      // If a previous turn is still pending (racing a new send), mark it stopped
      // so it never lingers as an orphaned "Thinking…" placeholder.
      const pendingAssistant = conversationsRef.current
        .get(docId)
        ?.messages.find((m) => m.role === "assistant" && m.status === "pending");
      if (pendingAssistant) {
        applyEvent({ type: "stop", documentId: docId, assistantId: pendingAssistant.id });
      }

      const userMessage: TutorMessage = {
        id: userId,
        role: "user",
        content: text,
        createdAt: now,
        status: "complete",
        errorMessage: null,
        request: { snapshot, question: text },
      };
      const assistantMessage: TutorMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: now,
        status: "pending",
        errorMessage: null,
        request: null,
        finishReason: null,
        continuationOf: null,
        savedPageNoteId: null,
      };

      applyEvent({ type: "send", documentId: docId, user: userMessage, assistant: assistantMessage });

      const messages = planSendMessages(
        conversationsRef.current.get(docId)?.messages ?? [],
        snapshot,
        text,
      );
      void runAssistant(docId, messages, assistantId, "tutor");
    },
    [applyEvent, buildSnapshot, runAssistant],
  );

  const retry = useCallback(
    (assistantId: string) => {
      const docId = documentIdRef.current;
      if (!docId) return;
      const conv = conversationsRef.current.get(docId);
      if (!conv) return;
      const chain = resolveAnswerChain(conv.messages, assistantId);
      if (!chain || !chain.rootUser || !chain.rootUser.request) return;

      const isContinuation = chain.messageIds.length > 1;
      applyEvent({ type: "retry", documentId: docId, assistantId });
      const messages = isContinuation
        ? planContinuationMessages(conv.messages, chain)
        : planNormalMessages(conv.messages, chain.rootUser);
      void runAssistant(docId, messages, assistantId, isContinuation ? "tutor-continue" : "tutor");
    },
    [applyEvent, runAssistant],
  );

  const continueFrom = useCallback(
    (assistantId: string) => {
      const docId = documentIdRef.current;
      if (!docId) return;
      const conv = conversationsRef.current.get(docId);
      if (!conv) return;
      const chain = resolveAnswerChain(conv.messages, assistantId);
      if (!chain || !chain.rootUser || !chain.rootUser.request) return;

      const now = Date.now();
      const continuationId = crypto.randomUUID();
      const continuation: TutorMessage = {
        id: continuationId,
        role: "assistant",
        content: "",
        createdAt: now,
        status: "pending",
        errorMessage: null,
        request: null,
        finishReason: null,
        continuationOf: assistantId,
        savedPageNoteId: null,
      };

      applyEvent({ type: "add-assistant", documentId: docId, assistant: continuation });
      const messages = planContinuationMessages(conv.messages, chain);
      void runAssistant(docId, messages, continuationId, "tutor-continue");
    },
    [applyEvent, runAssistant],
  );

  const saveToPageNote = useCallback(
    async (assistantId: string) => {
      const docId = documentIdRef.current;
      if (!docId) return;
      const conv = conversationsRef.current.get(docId);
      if (!conv) return;
      const chain = resolveAnswerChain(conv.messages, assistantId);
      if (!chain || !chain.rootUser || !chain.rootUser.request) return;

      // Duplicate-save protection: the whole answer chain is saved at most once.
      const alreadySaved = chain.messageIds.some(
        (id) => conv.messages.find((m) => m.id === id)?.savedPageNoteId != null,
      );
      if (alreadySaved) return;

      const answer = chain.accumulated.trim();
      if (!answer) return;

      const { snapshot, question } = chain.rootUser.request;
      const title = `AI Tutor · ${questionExcerpt(question)}`;
      const body = `### Question\n\n${question.trim()}\n\n### AI Tutor\n\n${answer}`;

      const note = await createTutorPageNoteRef.current({
        pageNumber: snapshot.page,
        title,
        note: body,
      });
      if (!note) return;

      applyEvent({
        type: "mark-saved",
        documentId: docId,
        messageIds: chain.messageIds,
        pageNoteId: note.id,
      });
    },
    [applyEvent],
  );

  const stop = useCallback(() => {
    const docId = documentIdRef.current;
    if (!docId) return;
    const requestId = inFlightRef.current.get(docId);
    if (!requestId) return;
    cancelledRef.current.add(requestId);
    debugAi("tutor:cancel", { requestId, reason: "stop" });
    void tauriAiTransport.cancel(requestId).catch(() => undefined);
  }, []);

  const clear = useCallback(() => {
    const docId = documentIdRef.current;
    if (!docId) return;
    const requestId = inFlightRef.current.get(docId);
    if (requestId) {
      cancelledRef.current.add(requestId);
      debugAi("tutor:cancel", { requestId, reason: "clear" });
      void tauriAiTransport.cancel(requestId).catch(() => undefined);
    }
    gateRef.current.invalidate(docId);
    applyEvent({ type: "clear", documentId: docId });
  }, [applyEvent]);

  // ---- document switch: cancel + invalidate the previous document ---------

  const prevDocRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = prevDocRef.current;
    if (previous && previous !== documentId) {
      const requestId = inFlightRef.current.get(previous);
      if (requestId) {
        cancelledRef.current.add(requestId);
        void tauriAiTransport.cancel(requestId).catch(() => undefined);
      }
      gateRef.current.invalidate(previous);
    }
    prevDocRef.current = documentId;
  }, [documentId]);

  const consumeDraftQuestion = useCallback(() => {
    const q = draftQuestion;
    setDraftQuestion(null);
    return q;
  }, [draftQuestion]);

  const acknowledgeOpen = useCallback(() => setOpenRequested(false), []);

  const conversation = useMemo(
    () => (documentId ? conversations.get(documentId) ?? null : null),
    [conversations, documentId],
  );

  const activeRunning = documentId != null && running[documentId] != null;

  const value = useMemo<TutorStore>(
    () => ({
      conversation,
      running: activeRunning,
      configured,
      draftQuestion,
      openRequested,
      acknowledgeOpen,
      consumeDraftQuestion,
      attachSelection,
      attachAnnotation,
      attachCurrentPage,
      askAnnotation,
      askPageNote,
      send: (q) => void send(q),
      stop,
      clear,
      retry,
      continueFrom,
      saveToPageNote: (id) => void saveToPageNote(id),
    }),
    [
      conversation,
      activeRunning,
      configured,
      draftQuestion,
      openRequested,
      acknowledgeOpen,
      consumeDraftQuestion,
      attachSelection,
      attachAnnotation,
      attachCurrentPage,
      askAnnotation,
      askPageNote,
      send,
      stop,
      clear,
      retry,
      continueFrom,
      saveToPageNote,
    ],
  );

  return <TutorContext.Provider value={value}>{children}</TutorContext.Provider>;
}

export function useTutor(): TutorStore {
  const ctx = useContext(TutorContext);
  if (!ctx) throw new Error("useTutor must be used within a TutorProvider");
  return ctx;
}
