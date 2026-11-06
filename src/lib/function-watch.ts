/**
 * Function watch (founder, 6/11/2026 — «when something breaks nobody tells me; I only find out by hitting it»): the
 * server's machine health has had a watchdog since October (RAM, CPU, disk, database, webhook), but a FEATURE failing —
 * the bot unable to read a slip, a post that did not go out, a feed or a sync erroring — only reached the event log.
 * This module turns the event log into alerts to the founder's private chat, and tells when the scheduler itself has
 * stopped. Pure: the server part is lib/server/function-watch.ts.
 *
 *   1. Every «error» → an alert (once per source and message in 30 minutes).
 *   2. Repeated «warn» → an alert: the bot's slip reading 3 times in an hour, the payments feeds 3, any source 10 in 30 min.
 *   3. «security» bursts → 10 in 30 minutes.
 *   4. A fault that stays quiet for 30 minutes → one «🟢 ល្អវិញ» message.
 *   5. Never more than 6 alerts an hour (then one line saying the rest are in the log); never a figure (8+ digit runs masked
 *      by the caller), never at night with a sound.
 */

export type Level = "info" | "warn" | "error" | "security"
export type WatchEvent = { at: number; level: Level; source: string; message: string }

export type Rule = { id: string; level: Level; sources?: string[]; match?: RegExp; threshold: number; windowMin: number }

/** Checked in order; an event counts for the first rule it matches only. */
export const RULES: Rule[] = [
  { id: "error", level: "error", threshold: 1, windowMin: 30 },
  // The bot reading receipts: three failures in an hour is a broken feature, not one blurry photo.
  { id: "slips", level: "warn", sources: ["slips", "scan"], match: /not fetched|not accepted|timed out|no reader|without JSON|retry error|still no reader/i, threshold: 3, windowMin: 60 },
  // Money arriving (KHQR / AUTOBOK, bank alerts, the SoundBox): three in an hour.
  { id: "payments", level: "warn", sources: ["khqr", "soundbox", "payment-chime", "bank-alert"], threshold: 3, windowMin: 60 },
  { id: "security", level: "security", threshold: 10, windowMin: 30 },
  { id: "warn", level: "warn", threshold: 10, windowMin: 30 },
]

/** Sources that already alert on their own (the machine watchdog) or would loop (this watcher). */
export const IGNORED_SOURCES = ["watchdog", "function-watch"]

export const COOLDOWN_MS = 30 * 60_000
export const QUIET_TO_RECOVER_MS = 30 * 60_000
export const MAX_ALERTS_PER_HOUR = 6
/** The events kept in memory: the longest window, with a margin. */
export const KEEP_MS = 2 * 60 * 60_000

/** What each source is, in the founder's words. Unknown sources show their technical name. */
export const SOURCE_KM: Record<string, string> = {
  slips: "Bot អានស្លីបធនាគារ",
  scan: "ការស្កេនស្លីបក្នុងអេប",
  khqr: "ការទទួលប្រាក់ KHQR / AUTOBOK",
  soundbox: "SoundBox",
  "payment-chime": "សំឡេងជូនដំណឹងពេលទទួលប្រាក់",
  "bank-alert": "សារជូនដំណឹងពីធនាគារ",
  "scheduled-posts": "ការផុសតាមម៉ោង",
  "daily-tip": "គន្លឹះប្រចាំថ្ងៃ",
  bulletin: "ព្រឹត្តិបត្រទីផ្សារ",
  market: "អត្រាប្តូរប្រាក់ និងមាស",
  nbc: "អត្រាប្តូរប្រាក់ NBC",
  "moc-fuel": "តម្លៃប្រេងឥន្ធនៈ",
  prayer: "ម៉ោងសឡាត",
  push: "ការជូនដំណឹងលើទូរសព្ទ",
  bills: "វិក្កយបត្រ និងការរំលឹក",
  loans: "កម្ចី",
  accounts: "គណនីធនាគារ",
  auth: "ការចូលគណនី",
  passkeys: "ការចូលដោយ Passkey",
  "bot-signup": "ការចុះឈ្មោះតាម Bot",
  bot: "Bot Telegram",
  dispatcher: "ម៉ាស៊ីនកំណត់ពេល (scheduler)",
  "erp-sync": "ការភ្ជាប់ DL Staff",
  "nightly-report": "របាយការណ៍ពេលយប់",
  "weekly-digest": "សេចក្តីសង្ខេបប្រចាំសប្តាហ៍",
  "holy-days": "ថ្ងៃសីល និងបុណ្យ",
  nasheed: "ណាស៊ីដ",
  "dua-audio": "សំឡេងឌុអា",
  orders: "ការកម្ម៉ង់ទុកមុន",
  "voice-alert": "សំឡេងជូនដំណឹង",
}

export const sourceLabel = (source: string) => SOURCE_KM[source] ?? source

/** The rule an event falls under, or null (info, ignored sources, a warn no rule asks about). */
export function ruleOf(e: WatchEvent): Rule | null {
  if (e.level === "info" || IGNORED_SOURCES.includes(e.source)) return null
  for (const r of RULES) {
    if (r.level !== e.level) continue
    if (r.sources && !r.sources.includes(e.source)) continue
    if (r.match && !r.match.test(e.message)) continue
    return r
  }
  return null
}

/** One fault: a rule for one source («error · slips»); an error is also keyed by its message, so two errors are two faults. */
export const faultKey = (r: Rule, e: WatchEvent) => (r.id === "error" ? `error|${e.source}|${normalize(e.message)}` : `${r.id}|${e.source}`)

/** Ids, counts and times vary between repeats of the same error: «post #35007 failed» and «post #35008 failed» are one fault. */
export const normalize = (message: string) => message.replace(/\(×\d+ more in 10 min\)/, "").replace(/\d+/g, "#").trim().slice(0, 120)

export type Fault = { key: string; rule: Rule; source: string; count: number; last: WatchEvent }

/** The faults firing now: per key, the events in the rule's window, when there are at least its threshold. */
export function firing(events: WatchEvent[], now: number): Fault[] {
  const by = new Map<string, Fault>()
  for (const e of events) {
    const rule = ruleOf(e)
    if (!rule || now - e.at > rule.windowMin * 60_000) continue
    const key = faultKey(rule, e)
    const f = by.get(key)
    if (f) {
      f.count += 1
      if (e.at >= f.last.at) f.last = e
    } else by.set(key, { key, rule, source: e.source, count: 1, last: e })
  }
  return [...by.values()].filter((f) => f.count >= f.rule.threshold)
}

export type WatchState = { open: Map<string, { since: number; lastAlert: number; lastSeen: number; source: string }>; sent: number[] }
export const newState = (): WatchState => ({ open: new Map(), sent: [] })

export type Message = { kind: "alert" | "recovered" | "capped"; text: string; key?: string }

/** Cambodia time «07:00» for an instant. */
export const hhmm = (at: number) => {
  const d = new Date(at + 7 * 3_600_000)
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`
}

/** 23:00–06:59 Cambodia: a message arrives without a sound (the founder sleeps; it is still there in the morning). */
export const quietHour = (at: number) => {
  const h = new Date(at + 7 * 3_600_000).getUTCHours()
  return h >= 23 || h < 7
}

export function alertText(f: Fault): string {
  const what = f.rule.id === "error" ? "មានកំហុស" : `បរាជ័យ ${f.count} ដងក្នុង ${f.rule.windowMin} នាទី`
  return [
    `🟠 បង មុខងារមួយមានបញ្ហា៖ ${sourceLabel(f.source)}`,
    `${what} (ចុងក្រោយម៉ោង ${hhmm(f.last.at)})`,
    `មូលហេតុ៖ ${f.last.message.slice(0, 180)}`,
    "លម្អិត៖ Admin › Super › មជ្ឈមណ្ឌលបញ្ជា › សន្តិសុខ",
  ].join("\n")
}

export const recoveredText = (source: string, since: number) => `🟢 បង ${sourceLabel(source)} ល្អវិញហើយ (បញ្ហាចាប់ពីម៉ោង ${hhmm(since)}, គ្មានថ្មីរយៈពេល 30 នាទី)`

export const cappedText = (n: number) => `🟠 បង មានបញ្ហា ${n} ទៀតក្នុងម៉ោងនេះ — មិនផ្ញើម្តងមួយៗទេ ដើម្បីកុំរំខាន។ មើលទាំងអស់នៅ Admin › Super › មជ្ឈមណ្ឌលបញ្ជា › សន្តិសុខ`

/**
 * One check: what to send now. Mutates `state` (open faults, the hour's sends). An open fault is alerted again only after
 * the cooldown and only while it keeps happening; it recovers once nothing new matched it for 30 minutes.
 */
export function evaluate(events: WatchEvent[], now: number, state: WatchState): Message[] {
  const out: Message[] = []
  state.sent = state.sent.filter((t) => now - t < 3_600_000)
  let capped = 0
  for (const f of firing(events, now)) {
    const open = state.open.get(f.key)
    if (open) {
      open.lastSeen = Math.max(open.lastSeen, f.last.at)
      if (now - open.lastAlert < COOLDOWN_MS || f.last.at <= open.lastAlert) continue
    }
    if (state.sent.length >= MAX_ALERTS_PER_HOUR) {
      capped += 1
      if (!open) state.open.set(f.key, { since: f.last.at, lastAlert: now, lastSeen: f.last.at, source: f.source })
      continue
    }
    state.sent.push(now)
    if (open) open.lastAlert = now
    else state.open.set(f.key, { since: f.last.at, lastAlert: now, lastSeen: f.last.at, source: f.source })
    out.push({ kind: "alert", key: f.key, text: alertText(f) })
  }
  if (capped) out.push({ kind: "capped", text: cappedText(capped) })
  // Still matched (below its threshold now)? Then it is not over: lastSeen follows every matching event.
  for (const e of events) {
    const rule = ruleOf(e)
    const open = rule && state.open.get(faultKey(rule, e))
    if (open) open.lastSeen = Math.max(open.lastSeen, e.at)
  }
  for (const [key, o] of state.open) {
    if (now - o.lastSeen < QUIET_TO_RECOVER_MS) continue
    state.open.delete(key)
    out.push({ kind: "recovered", key, text: recoveredText(o.source, o.since) })
  }
  return out
}

/**
 * The scheduler's own heartbeat (the dead-man switch): every minute it runs a pass; the watcher itself runs inside the
 * same process, so «stuck» (a pass running for 10 minutes — one step hangs and blocks every post, reminder and alert after
 * it) and «stalled» (no pass finished for 10 minutes) are reported by /api/health too, where UptimeRobot sees them from
 * outside.
 */
export const STALL_MS = 10 * 60_000
export type Heartbeat = { bootAt: number; passStart: number | null; passEnd: number | null }
export function schedulerState(hb: Heartbeat, now: number): "ok" | "stuck" | "stalled" {
  if (hb.passStart != null && (hb.passEnd == null || hb.passStart > hb.passEnd) && now - hb.passStart > STALL_MS) return "stuck"
  if (now - (hb.passEnd ?? hb.bootAt) > STALL_MS) return "stalled"
  return "ok"
}

export const schedulerText = (state: "stuck" | "stalled", since: number) =>
  state === "stuck"
    ? `🔴 បង ម៉ាស៊ីនកំណត់ពេល (scheduler) គាំងតាំងពីម៉ោង ${hhmm(since)} — ការផុស ការរំលឹក និងសារជូនដំណឹងទាំងអស់កំពុងរង់ចាំ។ ខ្ញុំត្រូវពិនិត្យភ្លាម។`
    : `🔴 បង ម៉ាស៊ីនកំណត់ពេល (scheduler) ឈប់ដើរតាំងពីម៉ោង ${hhmm(since)} — ការផុស និងការរំលឹកមិនចេញទេ។`
export const schedulerOkText = "🟢 បង ម៉ាស៊ីនកំណត់ពេល (scheduler) ដើរវិញហើយ។"
