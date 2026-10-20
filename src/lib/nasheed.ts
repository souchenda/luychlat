/**
 * Qasidah & Nasheed — the pure rules shared by the page, the submit route and the bot (founder, 18/10/2026).
 *
 * audio_path of a track:
 *   "/audio/nasheed/…"  a CC-licensed recording served by the app itself (credit shown under the title)
 *   "sub:<uid>/<id>.mp3" a member's submission, still in the PRIVATE bucket — never playable by the public
 *   "community/<id>.mp3" or "<uuid>.mp3"  a file in the public bucket «nasheed-audio»
 */

import * as G from "@/lib/islamic/glossary"

export const SUBMIT_MAX_BYTES = 20 * 1024 * 1024
export const SUBMIT_TYPES = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a"] as const
export const SUBMISSIONS_BUCKET = "nasheed-submissions"

export type SubmissionInput = {
  title: string
  artist: string
  file: { name: string; size: number; type: string } | null
  /** The one confirmation (founder, 20/10/2026): an authentic Islamic qasidah / nasheed, nothing contrary to the faith. */
  authentic: boolean
}

export type SubmissionError = "nasheed.titleRequired" | "nasheed.artistRequired" | "nasheed.fileRequired" | "nasheed.tooBig" | "nasheed.notAudio" | "nasheed.confirmRequired"

/** The first thing wrong with a submission (an i18n key — one message per field, founder 19/10/2026), or null. */
export function submissionError(v: SubmissionInput): SubmissionError | null {
  if (!v.title.trim() || v.title.trim().length > 120) return "nasheed.titleRequired"
  if (!v.artist.trim() || v.artist.trim().length > 120) return "nasheed.artistRequired"
  if (!v.file) return "nasheed.fileRequired"
  if (v.file.size > SUBMIT_MAX_BYTES) return "nasheed.tooBig"
  if (!submissionExt(v.file)) return "nasheed.notAudio"
  if (!v.authentic) return "nasheed.confirmRequired"
  return null
}

/**
 * mp3 / m4a / aac from the type, else from the name's extension when the phone gives a generic or odd audio type —
 * a file named in Arabic («…حلم_التخرج_تحقق…128k.mp3») often comes as application/octet-stream or audio/x-mpeg
 * (founder, 19/10/2026: such an upload failed). Never from a non-audio type (an .mp3 labelled video/mp4 stays
 * refused; an .m4a labelled video/mp4 is the same container). The stored name is always a UUID (submissionPath).
 */
export function submissionExt(file: { name: string; type: string }): "mp3" | "m4a" | "aac" | null {
  const type = file.type.toLowerCase().trim()
  if (type === "audio/mpeg" || type === "audio/mp3") return "mp3"
  if (type === "audio/mp4" || type === "audio/x-m4a" || type === "audio/m4a") return "m4a"
  if (type === "audio/aac" || type === "audio/x-aac") return "aac"
  const ext = file.name.normalize("NFC").split(".").pop()?.toLowerCase().trim()
  const byName = ext === "mp3" || ext === "m4a" || ext === "aac" ? ext : null
  const generic = !type || type === "application/octet-stream" || type === "binary/octet-stream" || type.startsWith("audio/")
  if (generic) return byName
  return type === "video/mp4" && byName === "m4a" ? "m4a" : null
}

/** Where a member's file is stored: their folder and a random UUID — never the file's own name (any script). */
export const submissionPath = (userId: string, ext: "mp3" | "m4a" | "aac", uuid: string = crypto.randomUUID()) => `${userId}/${uuid}.${ext}`

export const contentTypeOf = (ext: string) => (ext === "mp3" ? "audio/mpeg" : ext === "aac" ? "audio/aac" : "audio/mp4")

/** Where the player streams a track from; null when it must not be played (a submission still in review). */
export function audioSrc(path: string | null, publicUrl: (path: string) => string): string | null {
  // «sub:» a submission in review; «own:» a member's private track (played through a signed URL, ownPath).
  if (!path || path.startsWith("sub:") || path.startsWith("own:")) return null
  if (path.startsWith("/audio/nasheed/")) return path
  return publicUrl(path)
}

/** A private track's file in the member's own folder of the private bucket («own:<user>/<uuid>.mp3»), or null. */
export const ownPath = (path: string | null) => (path?.startsWith("own:") && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp3|m4a|aac)$/.test(path.slice(4)) ? path.slice(4) : null)

/** 🌐 shared with the community (reviewed first) or 🔒 kept for one's own listening (founder, 20/10/2026). */
export type NasheedVisibility = "public" | "private"

/** Private tracks need only a title, an artist and the audio file — no confirmation, no review. */
export const privateError = (v: Omit<SubmissionInput, "authentic">): SubmissionError | null => submissionError({ ...v, authentic: true })

type Rankable = { likes: number; sort: number; created_at?: string }

/** The community's favourites first, then the curated order, then the oldest. */
export function rankTracks<T extends Rankable>(tracks: T[]): T[] {
  return [...tracks].sort((a, b) => b.likes - a.likes || a.sort - b.sort || (a.created_at ?? "").localeCompare(b.created_at ?? ""))
}

// ─── The founder's review in Telegram ───────────────────────────────────────────────────────

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const CALLBACK = new RegExp(`^ns:(${UUID}):(a|r)$`)

export const isNasheedCallback = (data: string | undefined) => !!data && data.startsWith("ns:")

export function parseNasheedCallback(data: string | undefined): { id: string; approve: boolean } | null {
  const m = data ? CALLBACK.exec(data) : null
  return m ? { id: m[1], approve: m[2] === "a" } : null
}

export const reviewButtons = (id: string) => [[{ text: "✅ អនុម័តចូលបណ្ណាល័យរួម", callback_data: `ns:${id}:a` }, { text: "❌ បដិសេធ", callback_data: `ns:${id}:r` }]]

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export type ReviewState = "PENDING" | "APPROVED" | "REJECTED"

/**
 * The review card in «LCA Approval» (founder, 20/10/2026): the request, title, singer, who shared it (name and phone or
 * Telegram @), then the decision with who decided and when once tapped.
 */
export function reviewCaption(v: { title: string; artist: string; submitter: string; contact?: string | null; state: ReviewState; badge?: string; decidedBy?: string | null; decidedAt?: string | null }) {
  const who = `${esc(v.submitter)}${v.contact && v.contact !== v.submitter ? ` (${esc(v.contact)})` : ""}`
  const decided =
    v.state === "PENDING"
      ? []
      : [
          v.state === "APPROVED" ? "✅ <b>បានអនុម័តចូលបណ្ណាល័យរួម</b>" : "❌ <b>បានបដិសេធ — ឯកសារត្រូវបានលុប</b>",
          ...(v.decidedBy ? [`👤 ដោយ៖ ${esc(v.decidedBy)}${v.decidedAt ? ` · ⏰ ${esc(v.decidedAt)}` : ""}`] : []),
          "",
        ]
  return [
    ...(v.badge ? [esc(v.badge)] : []),
    ...decided,
    "🎵 <b>សំណើចែករំលែកបទកសាដះ/ណាស្សីដថ្មី</b>",
    `• <b>ចំណងជើងបទ៖</b> ${esc(v.title)}`,
    `• <b>អ្នកសូត្រ/ច្រៀង៖</b> ${esc(v.artist)}`,
    `• <b>អ្នកចែករំលែក៖</b> 👤 ${who}`,
    "",
    v.state === "PENDING" ? "សូមស្តាប់សាកល្បង និងចុចសម្រេចចិត្ត៖" : "ចែករំលែកដើម្បីស្តាប់ក្នុងសហគមន៍ដោយមិនរកប្រាក់ចំណេញ — លុបចេញភ្លាមៗ បើម្ចាស់កម្មសិទ្ធិស្នើសុំ។",
  ].join("\n")
}

// ─── The community library: 30 public tracks, plays, and the polite move into «បទផ្ទាល់ខ្លួន» (founder, 20/10/2026) ───

export const NASHEED_PUBLIC_CAP = 30
export const NASHEED_GRACE_DAYS = 7
/** A listen counts once it passes 15 seconds (once per listener and track every 30 minutes — the database). */
export const PLAY_COUNT_SECONDS = 15

/** «🎧 ១២ ដង» on a public track. */
export const playsChip = (n: number) => `🎧 ${String(n).replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)])} ដង`

/** The thank-you right after a public submission — the app's dialog (plain) and the submitter's Telegram (HTML). */
export function submittedThanksNasheed(title: string, html: boolean): string {
  const b = (s: string) => (html ? `<b>${esc(s)}</b>` : s)
  return [
    `🕌 ${b(`${G.ASSALAMU_ALAIKUM} បងប្អូន!`)}`,
    "",
    `អេប លុយឆ្លាត សូមថ្លែងអំណរគុណយ៉ាងជ្រាលជ្រៅចំពោះការចូលរួមចែករំលែកបទ ${b(`«${title}»`)}។ ក្រុមការងារអេដមីននឹងពិនិត្យ និងអនុម័តដាក់បញ្ចូលក្នុងបណ្ណាល័យសហគមន៍ឆាប់ៗនេះ។`,
    "",
    `${G.JAZAKALLAH} (Jazakallahu Khayran)! សូមអល់ឡោះ ﷻ ប្រទានពរជ័យ និង${G.BARAKAH}ដល់បងប្អូន! 🤲✨`,
  ].join("\n")
}

/** The submitter's note when their track makes room for new ones (Telegram HTML and the in-app bell). */
export function demotedNotice(title: string): { html: string; title: string; plain: string } {
  const body = (b: (s: string) => string) =>
    [
      `🕌 ${b("សារពី អេប លុយឆ្លាត (សហគមន៍ឥស្លាម)")}`,
      "",
      `« ${b(`${G.ASSALAMU_ALAIKUM} បងប្អូន!`)}`,
      `បទ ${b(title)} ដែលបងប្អូនបានចូលរួមចែករំលែក ត្រូវបានប្រព័ន្ធដកចេញពីបណ្ណាល័យសាធារណៈជាបណ្តោះអាសន្ន ដោយសារមិនសូវមានការចុចស្តាប់គាំទ្រ ដើម្បីទុកកន្លែងសម្រាប់បទថ្មីៗ។`,
      "",
      `${G.JAZAKALLAH} (Jazakallahu Khayran) សម្រាប់ការចូលរួមចំណែកដ៏មានតម្លៃរបស់បងប្អូន! សូមអល់ឡោះ ﷻ ប្រទានពរជ័យ និង${G.BARAKAH}ដល់បងប្អូន និងក្រុមគ្រួសារ! 🤲✨ »`,
      "",
      "បញ្ជាក់៖ បទនេះនៅតែរក្សាទុកក្នុងផ្ទាំង «បទផ្ទាល់ខ្លួន» (My Tracks) របស់បងប្អូនដដែល។",
    ].join("\n")
  return { html: body((s) => `<b>${esc(s)}</b>`), title: `🕌 ${G.ASSALAMU_ALAIKUM} — បទ «${title}» នៅក្នុងបទផ្ទាល់ខ្លួនរបស់អ្នក`, plain: body((s) => s) }
}

/** The line to the founder when a track was moved. */
export const demotedReport = (title: string, plays: number) =>
  `ℹ️ <b>បង្វិលបទចម្រៀង៖</b> បទ «${esc(title)}» (អ្នកស្តាប់៖ ${plays} ដង) ត្រូវបានប្តូរទៅកាន់បទផ្ទាល់ខ្លួនរបស់អ្នក Upload ដើម្បីបើកផ្លូវឱ្យបទថ្មី។`

/** Over 30 with nothing movable (every member track still in its first 7 days, or the app's own): the founder is told. */
export const overflowReport = (total: number) =>
  `ℹ️ <b>បណ្ណាល័យកសាដះ៖</b> មាន ${total} បទ (លើស ${NASHEED_PUBLIC_CAP}) — មិនទាន់មានបទណាអាចបង្វិលចេញបានទេ ព្រោះបទរបស់សមាជិកទាំងអស់នៅក្នុង ${NASHEED_GRACE_DAYS} ថ្ងៃដំបូង។`
