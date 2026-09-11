import { getCurrentWindow } from "@tauri-apps/api/window";

export async function toggleFullscreen(): Promise<void> {
  const win = getCurrentWindow();
  const isFullscreen = await win.isFullscreen();
  await win.setFullscreen(!isFullscreen);
}

export async function setWindowTitle(title: string): Promise<void> {
  await getCurrentWindow().setTitle(title);
}

export async function closeWindow(): Promise<void> {
  await getCurrentWindow().close();
}
