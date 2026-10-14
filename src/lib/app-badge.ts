/**
 * The home-screen icon badge. Android (e.g. Samsung One UI) shows a count on
 * the app icon for every notification LuyChlat left in the notification shade
 * (prayer-time alerts), and installed PWAs can also set a number themselves
 * (Badging API). Both are cleared once the user has opened the app, so the
 * icon never shows a "1" that the in-app bell can't explain.
 */

type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

type ShadeNavigator = { serviceWorker?: { ready: Promise<{ getNotifications?: () => Promise<{ close: () => void }[]> }> } }

/**
 * Close LuyChlat's notifications still shown in the notification shade (Android's notification bar).
 * Waits for the active service worker (`ready` — getRegistration() can come back empty right after the
 * app opens), at most 3 s: `ready` never settles where no worker was ever registered. Returns how many.
 */
export async function clearShownNotifications(nav: ShadeNavigator | undefined = typeof navigator === "undefined" ? undefined : (navigator as ShadeNavigator)): Promise<number> {
  if (!nav?.serviceWorker) return 0
  try {
    const reg = await Promise.race([nav.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000))])
    const shown = (await reg?.getNotifications?.()) ?? []
    for (const n of shown) n.close()
    return shown.length
  } catch {
    // Not supported (e.g. iOS before 16.4): nothing to clear.
    return 0
  }
}

/** The icon badge = unread in-app notifications; cleared at 0. */
export async function syncAppBadge(unread: number) {
  if (typeof navigator === "undefined") return
  const nav = navigator as BadgeNavigator
  try {
    if (unread > 0) await nav.setAppBadge?.(unread)
    else await nav.clearAppBadge?.()
  } catch {
    // Badging isn't available outside an installed app; ignore.
  }
}
