import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { Menu } from "@tauri-apps/api/menu";
import { getRecentDocuments } from "../platform/db";
import type { AppCommands } from "./commands";

export interface MenuSyncState {
  recentKey: string;
}

export function useAppMenu(
  commandsRef: MutableRefObject<AppCommands>,
  sync: MenuSyncState,
) {
  const menuRef = useRef<Menu | null>(null);

  // Build (or rebuild) the menu when the recent-documents set changes.
  useEffect(() => {
    let disposed = false;

    (async () => {
      const recent = await getRecentDocuments(10).catch(() => []);
      const recentItems =
        recent.length > 0
          ? recent.map((doc) => ({
              id: `recent-${doc.id}`,
              text: doc.title,
              action: () => commandsRef.current.openRecent(doc.path),
            }))
          : [{ id: "recent-none", text: "No recent documents", enabled: false }];

      const menu = await Menu.new({
        items: [
          {
            text: "File",
            items: [
              {
                id: "open",
                text: "Open PDF…",
                accelerator: "CmdOrCtrl+O",
                action: () => commandsRef.current.openFile(),
              },
              { text: "Open Recent", items: recentItems },
              { item: "Separator" },
              {
                id: "close-doc",
                text: "Close Document",
                accelerator: "CmdOrCtrl+W",
                action: () => commandsRef.current.closeDocument(),
              },
              { item: "Separator" },
              {
                id: "quit",
                text: "Quit",
                accelerator: "CmdOrCtrl+Q",
                action: () => commandsRef.current.quit(),
              },
            ],
          },
          {
            text: "Edit",
            items: [
              {
                id: "copy",
                text: "Copy",
                accelerator: "CmdOrCtrl+C",
                action: () => commandsRef.current.copy(),
              },
            ],
          },
          {
            text: "View",
            items: [
              {
                text: "Zoom",
                items: [
                  {
                    id: "zoom-in",
                    text: "Zoom In",
                    accelerator: "CmdOrCtrl+=",
                    action: () => commandsRef.current.zoomIn(),
                  },
                  {
                    id: "zoom-out",
                    text: "Zoom Out",
                    accelerator: "CmdOrCtrl+-",
                    action: () => commandsRef.current.zoomOut(),
                  },
                  {
                    id: "zoom-actual",
                    text: "Actual Size",
                    accelerator: "CmdOrCtrl+0",
                    action: () => commandsRef.current.actualSize(),
                  },
                  { item: "Separator" },
                  { id: "fit-page", text: "Fit Page", action: () => commandsRef.current.fitPage() },
                  { id: "fit-width", text: "Fit Width", action: () => commandsRef.current.fitWidth() },
                ],
              },
              { item: "Separator" },
              {
                id: "toggle-left",
                text: "Toggle Left Sidebar",
                action: () => commandsRef.current.toggleLeftSidebar(),
              },
              {
                id: "toggle-right",
                text: "Toggle Right Sidebar",
                action: () => commandsRef.current.toggleRightSidebar(),
              },
              { item: "Separator" },
              {
                id: "fullscreen",
                text: "Full Screen",
                accelerator: "F11",
                action: () => commandsRef.current.toggleFullscreen(),
              },
            ],
          },
          {
            text: "Navigate",
            items: [
              { id: "prev-page", text: "Previous Page", action: () => commandsRef.current.previousPage() },
              { id: "next-page", text: "Next Page", action: () => commandsRef.current.nextPage() },
              { id: "first-page", text: "First Page", action: () => commandsRef.current.firstPage() },
              { id: "last-page", text: "Last Page", action: () => commandsRef.current.lastPage() },
              { item: "Separator" },
              { id: "goto-page", text: "Go to Page", action: () => commandsRef.current.goToPage() },
            ],
          },
          {
            text: "Help",
            items: [
              { id: "about", text: "About Relax Note", action: () => commandsRef.current.about() },
            ],
          },
        ],
      });

      if (disposed) return;
      menuRef.current = menu;
      await menu.setAsAppMenu();
    })().catch((error) => console.warn("Failed to build application menu:", error));

    return () => {
      disposed = true;
      menuRef.current = null;
    };
  }, [commandsRef, sync.recentKey]);
}
