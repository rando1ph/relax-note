import Database from "@tauri-apps/plugin-sql";
import type { Annotation, AnnotationSegment, AnnotationType } from "../annotations/types";

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
      "SELECT last_page AS lastPage, zoom FROM documents WHERE id = $1 LIMIT 1",
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
  },
): Promise<void> {
  try {
    const db = await getDb();
    // The legacy `reading_mode` / `scroll_offset` columns are left in place
    // (unused) so existing databases remain intact without a destructive
    // migration.
    await db.execute(
      `UPDATE documents
       SET last_page = $2, zoom = $3, modified_at = $4
       WHERE id = $1`,
      [id, state.lastPage, state.zoom, Date.now()],
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

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

interface AnnotationRow {
  id: string;
  document_id: string;
  type: string;
  color: string;
  source_text: string;
  title: string | null;
  note: string;
  is_complete: number;
  created_at: number;
  updated_at: number;
}

interface AnnotationRectRow {
  annotation_id: string;
  page_number: number;
  seq: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Loads all complete annotations for a document, assembled with their geometry
 * segments (in `seq` order). Best-effort: failures return an empty list.
 *
 * Incomplete (`is_complete = 0`) rows are never returned and are purged
 * (scoped to this document) before loading. Annotations with zero geometry are
 * defensively ignored (should be impossible with `is_complete = 1`).
 */
export async function loadAnnotations(documentId: string): Promise<Annotation[]> {
  try {
    const db = await getDb();

    await db
      .execute("DELETE FROM annotations WHERE document_id = $1 AND is_complete = 0", [
        documentId,
      ])
      .catch(() => undefined);

    const annotationRows = await db.select<AnnotationRow[]>(
      `SELECT id, document_id, type, color, source_text, title, note, is_complete,
              created_at, updated_at
       FROM annotations
       WHERE document_id = $1 AND is_complete = 1
       ORDER BY created_at ASC, id ASC`,
      [documentId],
    );

    const rectRows = await db.select<AnnotationRectRow[]>(
      `SELECT r.annotation_id, r.page_number, r.seq, r.x, r.y, r.width, r.height
       FROM annotation_rects r
       JOIN annotations a ON a.id = r.annotation_id
       WHERE a.document_id = $1 AND a.is_complete = 1
       ORDER BY r.annotation_id ASC, r.seq ASC`,
      [documentId],
    );

    const segmentsByAnnotation = new Map<string, AnnotationSegment[]>();
    for (const row of rectRows) {
      const segments = segmentsByAnnotation.get(row.annotation_id) ?? [];
      segments.push({
        pageNumber: row.page_number,
        rect: { x: row.x, y: row.y, width: row.width, height: row.height },
        seq: row.seq,
      });
      segmentsByAnnotation.set(row.annotation_id, segments);
    }

    const result: Annotation[] = [];
    for (const row of annotationRows) {
      const segments = segmentsByAnnotation.get(row.id) ?? [];
      if (segments.length === 0) {
        continue;
      }
      result.push({
        id: row.id,
        documentId: row.document_id,
        type: row.type as AnnotationType,
        color: row.color,
        sourceText: row.source_text,
        title: row.title,
        note: row.note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        segments,
      });
    }
    return result;
  } catch (error) {
    console.warn("Failed to load annotations:", error);
    return [];
  }
}

export interface NewAnnotation {
  id: string;
  documentId: string;
  type: AnnotationType;
  color: string;
  sourceText: string;
  title: string | null;
  note: string;
  createdAt: number;
  updatedAt: number;
  segments: AnnotationSegment[];
}

/**
 * Crash-safe creation using the `is_complete` publication flag: the parent row
 * is inserted invisible (`is_complete = 0`), geometry segments are inserted,
 * and only then is the parent flipped to `is_complete = 1`. A partial write is
 * therefore never visible to loads. On any normal failure the parent is
 * deleted (compensating cleanup).
 *
 * Throws on failure so the caller can avoid adding the annotation to state.
 */
export async function createAnnotation(input: NewAnnotation): Promise<void> {
  const db = await getDb();
  try {
    await db.execute(
      `INSERT INTO annotations
         (id, document_id, type, color, source_text, title, note, is_complete, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9)`,
      [
        input.id,
        input.documentId,
        input.type,
        input.color,
        input.sourceText,
        input.title,
        input.note,
        input.createdAt,
        input.updatedAt,
      ],
    );

    for (const segment of input.segments) {
      await db.execute(
        `INSERT INTO annotation_rects
           (id, annotation_id, page_number, seq, x, y, width, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newId(),
          input.id,
          segment.pageNumber,
          segment.seq,
          segment.rect.x,
          segment.rect.y,
          segment.rect.width,
          segment.rect.height,
        ],
      );
    }

    await db.execute("UPDATE annotations SET is_complete = 1 WHERE id = $1", [input.id]);
  } catch (error) {
    await db.execute("DELETE FROM annotations WHERE id = $1", [input.id]).catch(() => undefined);
    throw error;
  }
}

/**
 * Persists editable fields (title/note/color). Does not touch geometry.
 */
export async function updateAnnotation(
  id: string,
  patch: { title?: string | null; note?: string; color?: string },
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (patch.title !== undefined) {
    fields.push("title = $" + (values.length + 1));
    values.push(patch.title);
  }
  if (patch.note !== undefined) {
    fields.push("note = $" + (values.length + 1));
    values.push(patch.note);
  }
  if (patch.color !== undefined) {
    fields.push("color = $" + (values.length + 1));
    values.push(patch.color);
  }

  fields.push("updated_at = $" + (values.length + 1));
  values.push(Date.now());

  values.push(id);
  const idParam = "$" + values.length;

  await db.execute(`UPDATE annotations SET ${fields.join(", ")} WHERE id = ${idParam}`, values);
}

/**
 * Single-statement delete; `ON DELETE CASCADE` removes the geometry rows
 * atomically within the same SQLite statement (FK enforcement is enabled by
 * the sqlx default `PRAGMA foreign_keys = ON`).
 */
export async function deleteAnnotation(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM annotations WHERE id = $1", [id]);
}
