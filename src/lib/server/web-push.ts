// Server only: phone push notifications (Web Push). The keys are server
// settings — VAPID_PUBLIC_KEY (public, handed to the app by /api/push/key),
// VAPID_PRIVATE_KEY (secret, never NEXT_PUBLIC_) and VAPID_SUBJECT. Without
// them push is simply off: the app hides its prompt and nothing is sent.
import webpush from "web-push"

import { morningPush } from "@/lib/morning"

import { logEvent } from "./events"
import { botDb, botKey } from "./telegram-bot"

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY?.trim() || null

function configured(): boolean {
  const pub = vapidPublicKey()
  const priv = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!pub || !priv) return false
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "https://luy.ibmserp.com", pub, priv)
  return true
}

/** 07:00: the morning message to every subscribed phone (once a day — the caller claims the day). */
export async function sendMorningPush(): Promise<number> {
  if (!configured()) return 0
  const { data, error } = await botDb().rpc("bot_push_targets", { p_key: botKey() })
  if (error) {
    logEvent("error", "push", `Push targets failed: ${error.message}`, { fold: true })
    return 0
  }
  const payload = JSON.stringify(morningPush())
  const gone: string[] = []
  const ok: string[] = []
  let failed = 0
  for (const s of (data as { endpoint: string; p256dh: string; auth: string }[] | null) ?? []) {
    try {
      // Kept up to 4 hours for a phone that's offline at 07:00 — a morning message after lunch is stale.
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 4 * 3600, urgency: "normal" })
      ok.push(s.endpoint)
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) gone.push(s.endpoint)
      else failed += 1
    }
  }
  if (gone.length || ok.length) await botDb().rpc("bot_push_result", { p_key: botKey(), p_gone: gone, p_ok: ok })
  logEvent(failed ? "warn" : "info", "push", `Morning push: ${ok.length} sent${gone.length ? `, ${gone.length} expired removed` : ""}${failed ? `, ${failed} failed` : ""}`, { fold: true })
  return ok.length
}
