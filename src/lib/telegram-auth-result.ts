/**
 * Telegram's redirect sign-in (oauth.telegram.org/auth … &return_to=) comes back to /login with
 * `#tgAuthResult=<base64 JSON>` — the same signed fields the widget's popup gives (id, names,
 * username, photo_url, auth_date, hash). The redirect works where the popup doesn't (Android
 * Chrome opens it as a tab and hands off to the Telegram app; the installed app's WebView).
 */
export function parseTgAuthResult(hash: string): Record<string, string | number> | null {
  const m = /(?:^#|&)tgAuthResult=([A-Za-z0-9+/_=-]+)/.exec(hash)
  if (!m) return null
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/")
    const json = decodeURIComponent(
      Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""),
    )
    const data = JSON.parse(json) as unknown
    return data && typeof data === "object" && "hash" in data && "id" in data ? (data as Record<string, string | number>) : null
  } catch {
    return null
  }
}

/** Telegram's sign-in page for this bot, coming back to `returnTo`. */
export const telegramAuthUrl = (botId: string, origin: string, returnTo: string) =>
  `https://oauth.telegram.org/auth?bot_id=${encodeURIComponent(botId)}&origin=${encodeURIComponent(origin)}&request_access=write&return_to=${encodeURIComponent(returnTo)}`
