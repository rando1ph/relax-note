import Database from "@tauri-apps/plugin-sql";
import type { ReadingMode } from "../state/readerState";

export interface DocumentIdentity {
  id: string;
  contentHash: string;
  pageCount: number | null;
}

export interface RecentDocument {
  id: string;
  path: string;
  title: string;
  pageCount: number | null;
  lastOpenedAt: number | null;
  lastPage: number;
}

export interface StoredReaderStateRow {
  lastPage: number | null;
  zoom: number | null;
  readingMode: ReadingMode | null;
  scrollOffset: number | null;
}

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:relax-note.db");
  }
  return dbPromise;
}

/**
 * Persists (or refreshes) the identity of a document that has been opened.
 * Best-effort: a failure here must never prevent reading a PDF.
 */
export async function upsertDocument(doc: {
  id: string;
  path: string;
  title: string;
  contentHash: string;
  pageCount: number;
}): Promise<void> {
  try {
    const db = await getDb();
    const now = Date.now();
    await db.execute(
      `INSERT INTO documents (id, path, title, content_hash, page_count, created_at, modified_at, last_opened_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(id) DO UPDATE SET
         path = excluded.path,
         title = excluded.title,
         page_count = excluded.page_count,
         modified_at = excluded.modified_at,
         last_opened_at = excluded.last_opened_at`,
      [doc.id, doc.path, doc.title, doc.contentHash, doc.pageCount, now, now, now],
    );
  } catch (error) {
    console.warn("Failed to persist document identity:", error);
  }
}

export async function findDocumentByPath(
  path: string,
): Promise<DocumentIdentity | null> {
  try {
    const db = await getDb();
    const rows = await db.select<{ id: string; content_hash: string; page_count: number | null }[]>(
      "SELECT id, content_hash, page_count FROM documents WHERE path = $1 LIMIT 1",
      [path],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, contentHash: row.content_hash, pageCount: row.page_count };
  } catch (error) {
    console.warn("Failed to look up document by path:", error);
    return null;
  }
}

export async function getRecentDocuments(limit = 20): Promise<RecentDocument[]> {
  try {
    const db = await getDb();
    return await db.select<RecentDocument[]>(
      `SELECT id, path, title, page_count AS pageCount,
              last_opened_at AS lastOpenedAt,
              COALESCE(last_page, 1) AS lastPage
       FROM documents
       ORDER BY last_opened_at DESC
       LIMIT $1`,
      [limit],
    );
  } catch (error) {
    console.warn("Failed to load recent documents:", error);
    return [];
  }
}

export async function getStoredReaderState(id: string): Promise<StoredReaderStateRow | null> {
  try {
    const db = await getDb();
    const rows = await db.select<StoredReaderStateRow[]>(
      "SELECT last_page AS lastPage, zoom, reading_mode AS readingMode, scroll_offset AS scrollOffset FROM documents WHERE id = $1 LIMIT 1",
      [id],
    );
    return rows[0] ?? null;
  } catch (error) {
    console.warn("Failed to load reader state:", error);
    return null;
  }
}

export async function saveReaderState(
  id: string,
  state: {
    lastPage: number;
    zoom: number;
    readingMode: ReadingMode;
    scrollOffset: number;
  },
): Promise<void> {
  try {
    const db = await getDb();
    await db.execute(
      `UPDATE documents
       SET last_page = $2, zoom = $3, reading_mode = $4, scroll_offset = $5, modified_at = $6
       WHERE id = $1`,
      [id, state.lastPage, state.zoom, state.readingMode, state.scrollOffset, Date.now()],
    );
  } catch (error) {
    console.warn("Failed to save reader state:", error);
  }
}

export async function touchOpened(id: string, pageCount: number): Promise<void> {
  try {
    const db = await getDb();
    await db.execute(
      "UPDATE documents SET last_opened_at = $2, page_count = $3, modified_at = $2 WHERE id = $1",
      [id, Date.now(), pageCount],
    );
  } catch (error) {
    console.warn("Failed to update last opened:", error);
  }
}
