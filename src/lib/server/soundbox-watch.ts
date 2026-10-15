// Server only: the SoundBox counter phones (founder, 14/10/2026).
//   • A sale arrives while no SoundBox of the business is ready → the owner hears «🔇 no SoundBox open».
//   • A counter phone gone (closed, locked, offline) over 10 minutes during 07:00–21:00 → one alert per
//     absence (offlineAlertDue in lib/soundbox.ts), checked every minute by the dispatcher.
import type { Locale } from "@/lib/i18n/dictionaries"
import { formatMoney } from "@/lib/money"
import { deviceReady, offlineAlertDue } from "@/lib/soundbox"
import { notifyOwner } from "@/lib/server/biz-group-bot"
import { logEvent } from "@/lib/server/events"
import { botDb, botKey, tr } from "@/lib/server/telegram-bot"

const ictTime = (iso: string) => new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(11, 16)

/** After a sale was sent to the SoundBox: no ready counter phone (in a business that uses one) → tell the owner. */
export async function alertIfNoSoundbox(workspaceId: string, amount: number, currency: "USD" | "KHR"): Promise<void> {
  const { data, error } = await botDb().rpc("bot_soundbox_ready", { p_key: botKey(), p_workspace: workspaceId })
  if (error) {
    logEvent("warn", "soundbox", `SoundBox readiness check failed: ${error.message}`, { fold: true })
    return
  }
  const r = data as { used?: boolean; ready?: number } | null
  if (!r?.used || Number(r.ready) > 0) return
  logEvent("info", "soundbox", "Sale arrived with no SoundBox ready — owner told", { fold: true })
  await notifyOwner({ workspaceId }, (lang: Locale) => tr(lang, "soundbox.alertNotOpen", { amount: formatMoney(amount, currency) }))
}

type Watched = {
  id: string
  workspace_id: string
  platform: string | null
  visible: boolean
  audio_unlocked: boolean
  live: boolean
  last_seen: string
  last_ready_at: string | null
  alerted_at: string | null
  other_ready: boolean
}

/** Every minute (the dispatcher): counter phones gone over 10 minutes during business hours. */
export async function soundboxWatchTick(now = Date.now()): Promise<void> {
  const { data, error } = await botDb().rpc("bot_soundbox_watch", { p_key: botKey() })
  if (error) {
    logEvent("warn", "soundbox", `SoundBox watch failed: ${error.message}`, { fold: true })
    return
  }
  for (const d of (data as Watched[] | null) ?? []) {
    const readyNow = d.other_ready || deviceReady(d, now)
    if (!offlineAlertDue({ lastReadyAt: d.last_ready_at, alertedAt: d.alerted_at, readyNow, now })) continue
    const { data: claimed } = await botDb().rpc("bot_soundbox_offline_claim", { p_key: botKey(), p_device: d.id, p_last_ready: d.last_ready_at })
    if (!claimed) continue
    const sent = await notifyOwner({ workspaceId: d.workspace_id }, (lang: Locale) =>
      tr(lang, "soundbox.alertOffline", { device: d.platform ?? "SoundBox", time: ictTime(d.last_ready_at!) }),
    )
    logEvent(sent ? "info" : "warn", "soundbox", `Counter phone offline over 10 min — owner ${sent ? "told" : "NOT reached"}`, { fold: true })
  }
}
