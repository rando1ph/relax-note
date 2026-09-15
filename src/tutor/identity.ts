import type { TutorContextIdentity } from "./types";

/**
 * Stable logical identity for a Tutor context. Two direct Ask AI actions that
 * resolve to the same identity continue the same conversation; a different
 * identity starts a fresh one (see the conversation reducer).
 */

function hashText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash + normalized.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function selectionIdentity(page: number, text: string): TutorContextIdentity {
  return { kind: "selection", page, hash: hashText(text) };
}

export function annotationIdentity(annotationId: string): TutorContextIdentity {
  return { kind: "annotation", annotationId };
}

export function pageNoteIdentity(pageNoteId: string): TutorContextIdentity {
  return { kind: "page-note", pageNoteId };
}

export function pageIdentity(documentId: string, page: number): TutorContextIdentity {
  return { kind: "page", documentId, page };
}

export function contextIdentityKey(identity: TutorContextIdentity): string {
  switch (identity.kind) {
    case "selection":
      return `selection:${identity.page}:${identity.hash}`;
    case "annotation":
      return `annotation:${identity.annotationId}`;
    case "page-note":
      return `page-note:${identity.pageNoteId}`;
    case "page":
      return `page:${identity.documentId}:${identity.page}`;
  }
}
