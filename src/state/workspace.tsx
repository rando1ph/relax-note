import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { getDocument } from "../pdf/pdfjs";
import type { PDFDocumentProxy } from "../pdf/pdfjs";
import { selectPdfFile, readPdfFile } from "../platform/fileDialog";
import {
  findDocumentByPath,
  getRecentDocuments,
  getStoredReaderState,
  saveReaderState,
  upsertDocument,
} from "../platform/db";
import type { RecentDocument } from "../platform/db";
import { sha256Hex } from "../lib/hash";
import { DEFAULT_READER_STATE } from "./readerState";
import type { ReaderState } from "./readerState";

export type TabStatus = "loading" | "ready" | "error";

export interface TabMeta {
  id: string;
  path: string;
  title: string;
  pageCount: number | null;
  status: TabStatus;
  error: string | null;
  readerState: ReaderState;
  needsAutoFit: boolean;
}

export interface SidebarState {
  open: boolean;
  width: number;
}

export type SidebarSide = "left" | "right";

interface WorkspaceState {
  tabs: TabMeta[];
  activeTabId: string | null;
  leftSidebar: SidebarState;
  rightSidebar: SidebarState;
}

type WorkspaceAction =
  | { type: "tab-loading"; id: string; path: string; title: string }
  | { type: "tab-ready"; id: string; pageCount: number; restore: StoredRestore }
  | { type: "tab-error"; id: string; error: string }
  | { type: "activate"; id: string | null }
  | { type: "close"; id: string }
  | { type: "set-reader-state"; id: string; patch: Partial<ReaderState> }
  | { type: "toggle-sidebar"; side: SidebarSide }
  | { type: "set-sidebar-open"; side: SidebarSide; open: boolean }
  | { type: "set-sidebar-width"; side: SidebarSide; width: number };

interface StoredRestore {
  lastPage: number | null;
  zoom: number | null;
}

const LEFT_SIDEBAR_DEFAULT = 264;
const RIGHT_SIDEBAR_DEFAULT = 300;

function clampWidth(width: number, min: number): number {
  return Math.max(min, Math.min(width, 640));
}

function initialSidebar(side: SidebarSide): SidebarState {
  const key = side === "left" ? "relax-note.left-sidebar" : "relax-note.right-sidebar";
  const fallback = side === "left" ? LEFT_SIDEBAR_DEFAULT : RIGHT_SIDEBAR_DEFAULT;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as { open: boolean; width: number };
      return {
        open: typeof parsed.open === "boolean" ? parsed.open : true,
        width: clampWidth(Number(parsed.width) || fallback, 180),
      };
    }
  } catch {
    // ignore malformed persisted state
  }
  return { open: true, width: fallback };
}

function reducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "tab-loading": {
      if (state.tabs.some((t) => t.id === action.id)) {
        return { ...state, activeTabId: action.id };
      }
      const tab: TabMeta = {
        id: action.id,
        path: action.path,
        title: action.title,
        pageCount: null,
        status: "loading",
        error: null,
        readerState: { ...DEFAULT_READER_STATE },
        needsAutoFit: true,
      };
      return {
        ...state,
        tabs: [...state.tabs, tab],
        activeTabId: action.id,
      };
    }

    case "tab-ready": {
      const restored: ReaderState = { ...DEFAULT_READER_STATE };
      if (action.restore.lastPage) restored.currentPage = action.restore.lastPage;
      const needsAutoFit = action.restore.zoom == null;
      if (action.restore.zoom != null) restored.scale = action.restore.zoom;

      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id
            ? {
                ...t,
                status: "ready",
                pageCount: action.pageCount,
                error: null,
                readerState: restored,
                needsAutoFit,
              }
            : t,
        ),
      };
    }

    case "tab-error":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...t, status: "error", error: action.error } : t,
        ),
      };

    case "activate":
      return { ...state, activeTabId: action.id };

    case "close": {
      const remaining = state.tabs.filter((t) => t.id !== action.id);
      let nextActive = state.activeTabId;
      if (state.activeTabId === action.id) {
        const idx = state.tabs.findIndex((t) => t.id === action.id);
        const fallback = remaining[Math.max(0, idx - 1)] ?? remaining[0];
        nextActive = fallback?.id ?? null;
      }
      return { ...state, tabs: remaining, activeTabId: nextActive };
    }

    case "set-reader-state":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id
            ? {
                ...t,
                readerState: { ...t.readerState, ...action.patch },
                needsAutoFit: action.patch.scale != null ? false : t.needsAutoFit,
              }
            : t,
        ),
      };

    case "toggle-sidebar": {
      const key = action.side === "left" ? "leftSidebar" : "rightSidebar";
      const current = state[key];
      return { ...state, [key]: { ...current, open: !current.open } };
    }

    case "set-sidebar-open": {
      const key = action.side === "left" ? "leftSidebar" : "rightSidebar";
      return { ...state, [key]: { ...state[key], open: action.open } };
    }

    case "set-sidebar-width": {
      const key = action.side === "left" ? "leftSidebar" : "rightSidebar";
      return { ...state, [key]: { ...state[key], width: clampWidth(action.width, 180) } };
    }

    default:
      return state;
  }
}

function friendlyError(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "PasswordException") {
    return "This PDF is password-protected and cannot be opened yet.";
  }
  if (name === "InvalidPDFException") {
    return "The selected file is not a valid PDF.";
  }
  return "Failed to open the PDF. The file may be corrupted or unreadable.";
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export interface Workspace {
  tabs: TabMeta[];
  activeTab: TabMeta | null;
  leftSidebar: SidebarState;
  rightSidebar: SidebarState;
  getDocumentProxy: (id: string) => PDFDocumentProxy | null;
  openFromDialog: () => Promise<void>;
  openPath: (path: string) => Promise<void>;
  activateTab: (id: string) => void;
  showHome: () => void;
  closeTab: (id: string) => void;
  setReaderState: (id: string, patch: Partial<ReaderState>) => void;
  goToPage: (page: number) => void;
  navigate: (dir: "prev" | "next" | "first" | "last") => void;
  toggleSidebar: (side: SidebarSide) => void;
  setSidebarOpen: (side: SidebarSide, open: boolean) => void;
  setSidebarWidth: (side: SidebarSide, width: number) => void;
  refreshRecent: () => Promise<RecentDocument[]>;
}

const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    tabs: [],
    activeTabId: null,
    leftSidebar: initialSidebar("left"),
    rightSidebar: initialSidebar("right"),
  }));

  const documentsRef = useRef<Map<string, PDFDocumentProxy>>(new Map());
  const tabsRef = useRef<TabMeta[]>(state.tabs);
  const saveTimersRef = useRef<Map<string, number>>(new Map());

  tabsRef.current = state.tabs;

  const scheduleSave = useCallback((tab: TabMeta) => {
    const existing = saveTimersRef.current.get(tab.id);
    if (existing != null) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      void saveReaderState(tab.id, {
        lastPage: tab.readerState.currentPage,
        zoom: tab.readerState.scale,
      });
      saveTimersRef.current.delete(tab.id);
    }, 500);
    saveTimersRef.current.set(tab.id, timer);
  }, []);

  const setReaderState = useCallback(
    (id: string, patch: Partial<ReaderState>) => {
      dispatch({ type: "set-reader-state", id, patch });
      const tab = tabsRef.current.find((t) => t.id === id);
      if (tab) {
        scheduleSave({ ...tab, readerState: { ...tab.readerState, ...patch } });
      }
    },
    [scheduleSave],
  );

  const activateTab = useCallback((id: string) => {
    dispatch({ type: "activate", id });
  }, []);

  const showHome = useCallback(() => {
    dispatch({ type: "activate", id: null });
  }, []);

  const openDocument = useCallback(
    async (path: string, title: string, bytes: Uint8Array) => {
      const normalized = normalizePath(path);

      const existingByPath = tabsRef.current.find((t) => t.path === normalized);
      if (existingByPath) {
        dispatch({ type: "activate", id: existingByPath.id });
        return;
      }

      let id: string;
      const known = await findDocumentByPath(normalized).catch(() => null);
      if (known) {
        id = known.id;
      } else {
        id = await sha256Hex(bytes);
      }

      const existingById = tabsRef.current.find((t) => t.id === id);
      if (existingById) {
        dispatch({ type: "activate", id: existingById.id });
        return;
      }

      dispatch({ type: "tab-loading", id, path: normalized, title });

      try {
        const pdf = await getDocument({ data: bytes }).promise;
        documentsRef.current.set(id, pdf);

        const restore = await getStoredReaderState(id).catch(() => null);
        dispatch({
          type: "tab-ready",
          id,
          pageCount: pdf.numPages,
          restore: restore
            ? {
                lastPage: restore.lastPage,
                zoom: restore.zoom,
              }
            : { lastPage: null, zoom: null },
        });

        void upsertDocument({
          id,
          path: normalized,
          title,
          contentHash: id,
          pageCount: pdf.numPages,
        });
      } catch (err) {
        documentsRef.current.delete(id);
        dispatch({ type: "tab-error", id, error: friendlyError(err) });
      }
    },
    [],
  );

  const openFromDialog = useCallback(async () => {
    const picked = await selectPdfFile();
    if (!picked) return;
    await openDocument(picked.path, picked.name, picked.bytes);
  }, [openDocument]);

  const openPath = useCallback(
    async (path: string) => {
      const normalized = normalizePath(path);
      const existing = tabsRef.current.find((t) => t.path === normalized);
      if (existing) {
        dispatch({ type: "activate", id: existing.id });
        return;
      }
      try {
        const picked = await readPdfFile(normalized);
        await openDocument(picked.path, picked.name, picked.bytes);
      } catch (err) {
        // A recent file that no longer exists: surface via a fresh tab error is
        // awkward; log and ignore for now.
        console.warn("Failed to reopen recent document:", err);
      }
    },
    [openDocument],
  );

  const closeTab = useCallback(
    (id: string) => {
      const tab = tabsRef.current.find((t) => t.id === id);
      if (tab) {
        const timer = saveTimersRef.current.get(id);
        if (timer != null) window.clearTimeout(timer);
        saveTimersRef.current.delete(id);
        void saveReaderState(id, {
          lastPage: tab.readerState.currentPage,
          zoom: tab.readerState.scale,
        });
      }
      const proxy = documentsRef.current.get(id);
      if (proxy) {
        void proxy.loadingTask.destroy().catch(() => undefined);
        documentsRef.current.delete(id);
      }
      dispatch({ type: "close", id });
    },
    [],
  );

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;

  const goToPage = useCallback(
    (page: number) => {
      if (!activeTab) return;
      const clamped = Math.min(Math.max(1, Math.round(page)), activeTab.pageCount ?? 1);
      setReaderState(activeTab.id, { currentPage: clamped });
    },
    [activeTab, setReaderState],
  );

  const navigate = useCallback(
    (dir: "prev" | "next" | "first" | "last") => {
      if (!activeTab) return;
      const count = activeTab.pageCount ?? 1;
      const current = activeTab.readerState.currentPage;
      let target = current;
      if (dir === "prev") target = current - 1;
      else if (dir === "next") target = current + 1;
      else if (dir === "first") target = 1;
      else target = count;
      target = Math.min(Math.max(1, target), count);
      setReaderState(activeTab.id, { currentPage: target });
    },
    [activeTab, setReaderState],
  );

  const toggleSidebar = useCallback((side: SidebarSide) => {
    dispatch({ type: "toggle-sidebar", side });
  }, []);

  const setSidebarOpen = useCallback((side: SidebarSide, open: boolean) => {
    dispatch({ type: "set-sidebar-open", side, open });
  }, []);

  const setSidebarWidth = useCallback((side: SidebarSide, width: number) => {
    dispatch({ type: "set-sidebar-width", side, width });
  }, []);

  const refreshRecent = useCallback(async () => {
    return getRecentDocuments(20);
  }, []);

  const getDocumentProxy = useCallback((id: string) => {
    return documentsRef.current.get(id) ?? null;
  }, []);

  // Persist sidebar state to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem("relax-note.left-sidebar", JSON.stringify(state.leftSidebar));
      localStorage.setItem("relax-note.right-sidebar", JSON.stringify(state.rightSidebar));
    } catch {
      // ignore
    }
  }, [state.leftSidebar, state.rightSidebar]);

  const value = useMemo<Workspace>(
    () => ({
      tabs: state.tabs,
      activeTab,
      leftSidebar: state.leftSidebar,
      rightSidebar: state.rightSidebar,
      getDocumentProxy,
      openFromDialog,
      openPath,
      activateTab,
      showHome,
      closeTab,
      setReaderState,
      goToPage,
      navigate,
      toggleSidebar,
      setSidebarOpen,
      setSidebarWidth,
      refreshRecent,
    }),
    [
      state.tabs,
      state.leftSidebar,
      state.rightSidebar,
      activeTab,
      getDocumentProxy,
      openFromDialog,
      openPath,
      activateTab,
      showHome,
      closeTab,
      setReaderState,
      goToPage,
      navigate,
      toggleSidebar,
      setSidebarOpen,
      setSidebarWidth,
      refreshRecent,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Workspace {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
