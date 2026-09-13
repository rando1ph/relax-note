# Relax Note

A lightweight, Linux-first PDF reading and annotation application built with
Tauri 2, React, TypeScript, and PDF.js. Inspired by the everyday reading
features of MarginNote, but deliberately much simpler.

## Current status (M3 — Vocabulary)

- Document tabs, Home/Recent Documents, paged reading, and zoom presets.
- Native application menu with accelerators; left sidebar outline/thumbnails.
- M2 annotation foundation: highlights with Title/Markdown Note, multi-rect
  normalized geometry, viewer-level annotation rail, right-sidebar inspector.
- M3 vocabulary: select a word/phrase and choose Vocabulary; a specialized
  annotation is created immediately (local, offline) with a wavy underline and
  a hollow rail ring. An async AI contextual dictionary enriches it with a
  concise bilingual entry (lemma, POS, British IPA, contextual Chinese meaning,
  English definition, optional explanation, domain).
- Local vocabulary data is authoritative; AI enrichment is replaceable and
  never blocks local creation. Failures preserve the annotation and offer
  retry; failed regeneration preserves the last good entry.
- AI transport runs in Rust (`reqwest`): URL validation, HTTPS-only except
  loopback, redirects disabled, and the API key is held by the OS credential
  store (Secret Service on Linux) or session-only memory. The key is never
  returned to the frontend.
- Right-sidebar Vocabulary tab: list, search, inspector, AI settings, and
  Test connection.

Original PDF files are never modified. Flashcards/SRS and the AI Tutor are out
of scope.

## Prerequisites

- Node.js 20+ and npm
- Rust (stable) with Cargo
- Tauri Linux prerequisites (webkit2gtk-4.1, libappindicator, etc.) — see
  https://tauri.app/start/prerequisites/

## Running locally

```sh
npm install
npm run tauri dev
```

## Building

```sh
npm run tauri build
```

## Project structure

```
src/
  state/       Workspace state (tabs, reader state) + persistence
  shell/       Native menu, keyboard shortcuts, tab bar, app shell
  home/        Home / Recent Documents view
  viewer/      Continuous + paged viewers, per-page rendering, thumbnails, zoom
  sidebar/     Left (outline/thumbnails) and right (placeholder) panels
  toolbar/     Reader toolbar
  pdf/         PDF.js integration, types, coordinate helpers, outline
  platform/    Tauri-specific adapters (file dialog, SQLite, window)
  lib/         Small shared utilities
src-tauri/     Tauri shell (plugins, capabilities, SQLite migrations)
```

## Architecture notes

- PDF bytes are read in place from the user's filesystem and passed to PDF.js
  as an in-memory buffer; the original file is never written to.
- The text layer is PDF.js's `TextLayer`, overlaid on each rendered page canvas.
- Annotation geometry (future) will be stored in normalized page-relative
  coordinates (fractions of page size) so it is stable across zoom and resize.
- Application data lives in a SQLite database under the app config directory
  (`sqlite:relax-note.db`), never in this repository.
