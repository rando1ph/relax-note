import Database from "@tauri-apps/plugin-sql";
import type { Annotation, AnnotationSegment, AnnotationType } from "../annotations/types";
import type {
  VocabularyEnrichment,
  VocabularyFields,
  VocabularyLocal,
  VocabularyStatus,
} from "../vocabulary/types";
import { EMPTY_VOCABULARY_FIELDS, emptyEnrichment } from "../vocabulary/types";
import { enrichmentFromRow } from "../vocabulary/rowMapping";
import type { VocabularyEnrichmentRowShape } from "../vocabulary/rowMapping";

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

// ---------------------------------------------------------------------------
// Vocabulary metadata
// ---------------------------------------------------------------------------

interface VocabularyRow {
  annotation_id: string;
  source_sentence: string;
  context_before: string;
  context_after: string;
  section_heading: string | null;
  created_at: number;
}

export interface VocabularyLocalPatch {
  sourceSentence?: string;
  contextBefore?: string;
  contextAfter?: string;
  sectionHeading?: string | null;
}

export interface VocabularyEnrichmentPatch {
  status?: VocabularyStatus;
  fields?: Partial<VocabularyFields>;
  model?: string | null;
  promptVersion?: string | null;
  generatedAt?: number | null;
  userEdited?: boolean;
  errorMessage?: string | null;
}

/**
 * Idempotently creates the 1:1 local + enrichment rows for a vocabulary
 * annotation. Safe to call repeatedly and after a crash: M2 annotation
 * creation stays authoritative, and a missing M3 row is never fatal.
 */
export async function ensureVocabularyRows(
  annotationId: string,
  sourceText: string,
  createdAt: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO vocabulary
       (annotation_id, source_sentence, context_before, context_after, section_heading, created_at)
     VALUES ($1, $2, '', '', NULL, $3)
     ON CONFLICT(annotation_id) DO NOTHING`,
    [annotationId, sourceText, createdAt],
  );
  await db.execute(
    `INSERT INTO vocabulary_enrichment (annotation_id, status, updated_at)
     VALUES ($1, 'pending', $2)
     ON CONFLICT(annotation_id) DO NOTHING`,
    [annotationId, Date.now()],
  );
}

export interface LoadedVocabulary {
  local: VocabularyLocal;
  enrichment: VocabularyEnrichment;
}

function rowToLocal(row: VocabularyRow): VocabularyLocal {
  return {
    annotationId: row.annotation_id,
    sourceSentence: row.source_sentence,
    contextBefore: row.context_before,
    contextAfter: row.context_after,
    sectionHeading: row.section_heading,
    createdAt: row.created_at,
  };
}

/**
 * Loads vocabulary metadata for all vocabulary annotations of a document.
 * Missing rows are repaired lazily by the caller; absent entries are simply
 * omitted here and synthesized by the caller.
 */
export async function loadVocabulary(
  documentId: string,
): Promise<Map<string, LoadedVocabulary>> {
  const result = new Map<string, LoadedVocabulary>();
  try {
    const db = await getDb();
    const localRows = await db.select<VocabularyRow[]>(
      `SELECT v.annotation_id, v.source_sentence, v.context_before, v.context_after,
              v.section_heading, v.created_at
       FROM vocabulary v
       JOIN annotations a ON a.id = v.annotation_id
       WHERE a.document_id = $1 AND a.is_complete = 1`,
      [documentId],
    );
    const enrichmentRows = await db.select<VocabularyEnrichmentRowShape[]>(
      `SELECT e.annotation_id, e.status, e.lemma, e.display_term, e.part_of_speech,
              e.ipa_uk, e.meaning_zh,
              e.domain, e.domain_specific, e.user_edited, e.error_message,
              e.model, e.prompt_version, e.generated_at, e.updated_at
       FROM vocabulary_enrichment e
       JOIN annotations a ON a.id = e.annotation_id
       WHERE a.document_id = $1 AND a.is_complete = 1`,
      [documentId],
    );

    for (const row of localRows) {
      result.set(row.annotation_id, {
        local: rowToLocal(row),
        enrichment: emptyEnrichment(),
      });
    }
    for (const row of enrichmentRows) {
      const existing = result.get(row.annotation_id);
      if (existing) {
        existing.enrichment = enrichmentFromRow(row);
      } else {
        // Enrichment without a local row: keep it; local row is repaired lazily.
        result.set(row.annotation_id, {
          local: {
            annotationId: row.annotation_id,
            sourceSentence: "",
            contextBefore: "",
            contextAfter: "",
            sectionHeading: null,
            createdAt: 0,
          },
          enrichment: enrichmentFromRow(row),
        });
      }
    }
  } catch (error) {
    console.warn("Failed to load vocabulary metadata:", error);
  }
  return result;
}

export async function updateVocabularyLocal(
  annotationId: string,
  patch: VocabularyLocalPatch,
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  const push = (column: string, value: unknown) => {
    fields.push(`${column} = $${values.length + 1}`);
    values.push(value);
  };
  if (patch.sourceSentence !== undefined) push("source_sentence", patch.sourceSentence);
  if (patch.contextBefore !== undefined) push("context_before", patch.contextBefore);
  if (patch.contextAfter !== undefined) push("context_after", patch.contextAfter);
  if (patch.sectionHeading !== undefined) push("section_heading", patch.sectionHeading);
  if (fields.length === 0) return;
  values.push(annotationId);
  await db.execute(
    `UPDATE vocabulary SET ${fields.join(", ")} WHERE annotation_id = $${values.length}`,
    values,
  );
}

/**
 * Persists enrichment. A patch that omits `fields` intentionally preserves the
 * existing generated fields (used for failed regeneration).
 */
export async function updateVocabularyEnrichment(
  annotationId: string,
  patch: VocabularyEnrichmentPatch,
): Promise<void> {
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  const push = (column: string, value: unknown) => {
    fields.push(`${column} = $${values.length + 1}`);
    values.push(value);
  };

  if (patch.status !== undefined) push("status", patch.status);
  if (patch.fields) {
    const f = { ...EMPTY_VOCABULARY_FIELDS, ...patch.fields };
    push("lemma", f.lemma);
    push("display_term", f.displayTerm);
    push("part_of_speech", f.partOfSpeech);
    push("ipa_uk", f.ipaUk);
    push("meaning_zh", f.meaningZh);
    push("domain", f.domain);
    push("domain_specific", f.domainSpecific ? 1 : 0);
  }
  if (patch.model !== undefined) push("model", patch.model);
  if (patch.promptVersion !== undefined) push("prompt_version", patch.promptVersion);
  if (patch.generatedAt !== undefined) push("generated_at", patch.generatedAt);
  if (patch.userEdited !== undefined) push("user_edited", patch.userEdited ? 1 : 0);
  if (patch.errorMessage !== undefined) push("error_message", patch.errorMessage);

  push("updated_at", Date.now());
  values.push(annotationId);
  await db.execute(
    `UPDATE vocabulary_enrichment SET ${fields.join(", ")} WHERE annotation_id = $${values.length}`,
    values,
  );
}

// ---------------------------------------------------------------------------
// Application settings (non-secret)
// ---------------------------------------------------------------------------

export async function getAppSetting(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    const rows = await db.select<{ value: string }[]>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [key],
    );
    return rows[0]?.value ?? null;
  } catch (error) {
    console.warn("Failed to read app setting:", error);
    return null;
  }
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, Date.now()],
  );
}

export async function deleteAppSetting(key: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM app_settings WHERE key = $1", [key]);
}
