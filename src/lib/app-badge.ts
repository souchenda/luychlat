/**
 * The home-screen icon badge. Android (e.g. Samsung One UI) shows a count on
 * the app icon for every notification LuyChlat left in the notification shade
 * (prayer-time alerts), and installed PWAs can also set a number themselves
 * (Badging API). Both are cleared once the user has opened the app, so the
 * icon never shows a "1" that the in-app bell can't explain.
 */

type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

/** Close LuyChlat's notifications still shown in the notification shade. */
export async function clearShownNotifications() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    for (const n of (await reg?.getNotifications()) ?? []) n.close()
  } catch {
    // Not supported (e.g. iOS before 16.4): nothing to clear.
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
