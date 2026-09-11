# Relax Note

A lightweight, Linux-first PDF reading and annotation application built with
Tauri 2, React, TypeScript, and PDF.js. Inspired by the everyday reading
features of MarginNote, but deliberately much simpler.

## Current status (M1.5 — Reader Workspace & UX Foundation)

- Document tabs (multiple PDFs open at once, per-document state).
- Home view with Recent Documents (restores last page, zoom, and reading mode).
- Two reading modes: continuous vertical scroll and single-page (paged).
- Zoom: sensible fit-page default, fit page/width/actual-size, Ctrl+wheel,
  Ctrl+= / Ctrl+- / Ctrl+0.
- Native application menu (File/Edit/View/Navigate/Help) with accelerators.
- Left sidebar: PDF outline and lazy windowed page thumbnails.
- Right sidebar shell (reserved for annotations/notes/vocabulary/AI tutor).
- Per-document reader state persisted in SQLite; filesystem scope persisted
  across restarts via the Tauri persisted-scope plugin.
- Selectable PDF text layer, windowed rendering, and large-PDF support retained
  from M1.

Original PDF files are never modified. Annotation editing is planned for a
future milestone.

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
