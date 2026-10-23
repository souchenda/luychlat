"use client"

/**
 * The in-app update, from APK 1.7 (founder, 23/10/2026 — Task #478 — android/…/AppUpdaterPlugin.java): the APK
 * downloaded inside the app with a progress sheet, then Android's installer on it — no Chrome, no download bar, no file
 * manager. Older APKs have no plugin: every call here rejects, and the update prompt keeps its older path.
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core"

type Updater = {
  canInstall(): Promise<{ allowed: boolean }>
  openInstallSettings(): Promise<void>
  download(o: { url: string }): Promise<{ path: string; bytes: number }>
  install(): Promise<void>
  addListener(event: "progress", cb: (p: { percent: number }) => void): Promise<PluginListenerHandle>
}

const AppUpdater = registerPlugin<Updater>("AppUpdater")

/** «Install unknown apps» allowed for the app (asked once; Android remembers). */
export const canInstallUpdates = () => AppUpdater.canInstall().then((r) => r.allowed)

/** The app's «Install unknown apps» switch in Android's settings. */
export const openInstallSettings = () => AppUpdater.openInstallSettings()

/** Downloads the APK (`onProgress`: 0–100, or -1 while the size is unknown), then opens Android's installer on it. */
export async function downloadAndInstall(url: string, onProgress: (percent: number) => void): Promise<void> {
  const listener = await AppUpdater.addListener("progress", (p) => onProgress(p.percent))
  try {
    await AppUpdater.download({ url })
    await AppUpdater.install()
  } finally {
    await listener.remove()
  }
}
