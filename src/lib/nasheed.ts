/**
 * Qasidah & Nasheed — the pure rules shared by the page, the submit route and the bot (founder, 18/10/2026).
 *
 * audio_path of a track:
 *   "/audio/nasheed/…"  a CC-licensed recording served by the app itself (credit shown under the title)
 *   "sub:<uid>/<id>.mp3" a member's submission, still in the PRIVATE bucket — never playable by the public
 *   "community/<id>.mp3" or "<uuid>.mp3"  a file in the public bucket «nasheed-audio»
 */

export const SUBMIT_MAX_BYTES = 20 * 1024 * 1024
export const SUBMIT_TYPES = ["audio/mpeg", "audio/mp4", "audio/aac", "audio/x-m4a"] as const
export const SUBMISSIONS_BUCKET = "nasheed-submissions"

export type SubmissionInput = {
  title: string
  artist: string
  file: { name: string; size: number; type: string } | null
  authentic: boolean
  rights: boolean
}

export type SubmissionError = "nasheed.titleRequired" | "nasheed.artistRequired" | "nasheed.fileRequired" | "nasheed.tooBig" | "nasheed.notAudio" | "nasheed.confirmRequired"

/** The first thing wrong with a submission (an i18n key — one message per field, founder 19/10/2026), or null. */
export function submissionError(v: SubmissionInput): SubmissionError | null {
  if (!v.title.trim() || v.title.trim().length > 120) return "nasheed.titleRequired"
  if (!v.artist.trim() || v.artist.trim().length > 120) return "nasheed.artistRequired"
  if (!v.file) return "nasheed.fileRequired"
  if (v.file.size > SUBMIT_MAX_BYTES) return "nasheed.tooBig"
  if (!submissionExt(v.file)) return "nasheed.notAudio"
  if (!v.authentic || !v.rights) return "nasheed.confirmRequired"
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
  if (!path || path.startsWith("sub:")) return null
  if (path.startsWith("/audio/nasheed/")) return path
  return publicUrl(path)
}

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

export const reviewButtons = (id: string) => [[{ text: "✅ អនុម័ត (Approve)", callback_data: `ns:${id}:a` }, { text: "❌ បដិសេធ (Reject)", callback_data: `ns:${id}:r` }]]

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export type ReviewState = "PENDING" | "APPROVED" | "REJECTED"

/** The caption under the audio in the founder's chat. */
export function reviewCaption(v: { title: string; artist: string; submitter: string; state: ReviewState; badge?: string }) {
  const head =
    v.state === "APPROVED" ? "✅ បានអនុម័ត — ផ្សាយក្នុង «🎧 ស្ដាប់ក្នុងអេប» ហើយ" : v.state === "REJECTED" ? "❌ បានបដិសេធ — ឯកសារត្រូវបានលុប" : "📤 បទកសាដះថ្មីពីសមាជិក — រង់ចាំការអនុម័ត"
  return [
    ...(v.badge ? [esc(v.badge)] : []),
    `<b>${head}</b>`,
    "",
    `🎵 ចំណងជើង៖ ${esc(v.title)}`,
    `🎤 អ្នកច្រៀង / ក្រុម៖ ${esc(v.artist)}`,
    `👤 អ្នកចែករំលែក៖ ${esc(v.submitter)}`,
    "",
    "អ្នកចែករំលែកបានបញ្ជាក់ថា ជាបទកសាដះ / ណាស្សីដឥស្លាមពិតប្រាកដ ហើយជាសំឡេងថតផ្ទាល់ខ្លួន ឬមានការអនុញ្ញាតឱ្យចែករំលែក។",
    v.state === "PENDING" ? "សូមស្ដាប់មុននឹងអនុម័ត — មិនទាន់មានអ្នកណាឃើញទេ។" : "",
  ]
    .filter((line, i, all) => line || i < all.length - 1)
    .join("\n")
}
