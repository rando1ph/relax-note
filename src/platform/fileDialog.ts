import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

export interface OpenedPdf {
  path: string;
  name: string;
  bytes: Uint8Array;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Prompts the user to select a local PDF and reads its bytes into memory.
 * Returns null when the user cancels the dialog.
 */
export async function selectPdfFile(): Promise<OpenedPdf | null> {
  const path = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (typeof path !== "string") {
    return null;
  }

  const bytes = await readFile(path);
  return { path, name: fileNameFromPath(path), bytes };
}

/** Reads a PDF by absolute path (used to reopen a recent document). */
export async function readPdfFile(path: string): Promise<OpenedPdf> {
  const bytes = await readFile(path);
  return { path, name: fileNameFromPath(path), bytes };
}
