/**
 * Channel protection (founder, 21/10/2026): @LuyChlatCommunity and @LuyChlatIslamic stay clean as they grow. Pure
 * (channel-guard.test.ts); the server side is lib/server/channel-guard.ts.
 *
 * Reactions — the Bot API (10.3) has NO method to choose a channel's reactions (`setChatAvailableReactions` is the
 * Telegram client protocol, a signed-in user, not a bot). The founder sets them once in Telegram (the channel › Edit ›
 * Reactions › Some reactions: 🥰 😁 🤔 🎉 👌 🥱 💯 🏆 🤝); the bot reads them (getChat › available_reactions) every morning and tells
 * the founder only when they differ (`reactionDrift`). In a discussion group the bot removes a reaction outside the list
 * (deleteMessageReaction — groups only, never channels).
 *
 * Comments — only in a channel's linked discussion group (never «LCA Approval», a pool or a business group): a message
 * with an outside link or an abusive / scam phrase is deleted; a second one within 10 minutes mutes the sender for
 * 24 hours. The channel's own forwards, the group's admins and the bot are never touched.
 */

/**
 * The reactions the founder set on both channels (in order — founder, 22/10/2026, Task #458): the ones the morning
 * check asks for. Never 🔥: in Islam fire stands for Hellfire (Jahannam), and the founder removed it from
 * @LuyChlatCommunity and @LuyChlatIslamic on purpose — the morning check must never ask for it again
 * (channel-guard.test.ts).
 */
export const REQUIRED_REACTIONS = ["🥰", "😁", "🤔", "🎉", "👌", "🥱", "💯", "🏆", "🤝"] as const

/**
 * Also allowed on both channels (founder, 23/10/2026 — Task #472): ❤️ 👍 👏 🙏 ✍️. Turned on or not, they are never
 * «extra» — the morning check stops flagging them — and never «missing» either (the founder may keep them off).
 */
export const OPTIONAL_REACTIONS = ["❤️", "👍", "👏", "🙏", "✍️"] as const

/** Every reaction the channels may show: the founder's nine, then the five allowed since 23/10. Never 🔥. */
export const POSITIVE_REACTIONS = [...REQUIRED_REACTIONS, ...OPTIONAL_REACTIONS] as const

/** Telegram writes ❤ without the variation selector; compare without it. */
const bare = (e: string) => e.replace(/️/g, "")

export const isPositiveReaction = (emoji: string) => POSITIVE_REACTIONS.some((p) => bare(p) === bare(emoji))

/**
 * In a channel's comment group (founder, 22/10/2026 — Task #459): the channels' reactions, which since 23/10 include
 * the everyday polite ones (👍 ❤️ 🙏, and 👏 ✍️). Never 🔥 — in the comments as on the channels.
 */
export const COMMENT_REACTIONS = POSITIVE_REACTIONS
export const isCommentReaction = (emoji: string) => COMMENT_REACTIONS.some((p) => bare(p) === bare(emoji))

export type ReactionType = { type: string; emoji?: string; custom_emoji_id?: string }

/**
 * What a chat allows against the list: `all` (available_reactions omitted — every emoji, the negative ones too), `off`
 * (an empty list — no reactions at all), or `list` with what is extra (to remove) and missing (to add).
 */
export function reactionDrift(available: ReactionType[] | undefined): { ok: boolean; state: "all" | "off" | "list"; extra: string[]; missing: string[] } {
  if (available === undefined) return { ok: false, state: "all", extra: [], missing: [] }
  const emojis = available.map((r) => (r.type === "emoji" && r.emoji ? r.emoji : r.type === "custom_emoji" ? "custom" : r.type))
  if (!emojis.length) return { ok: false, state: "off", extra: [], missing: [...REQUIRED_REACTIONS] }
  // Extra: outside the allowed fourteen. Missing: one of the founder's nine (the five optional ones may stay off).
  const extra = emojis.filter((e) => !isPositiveReaction(e))
  const missing = REQUIRED_REACTIONS.filter((p) => !emojis.some((e) => bare(e) === bare(p)))
  return { ok: !extra.length && !missing.length, state: "list", extra, missing: [...missing] }
}

/** The founder's note for a channel whose reactions differ — what to change, step by step. */
export function reactionFixText(channel: string, drift: ReturnType<typeof reactionDrift>): string {
  const now =
    drift.state === "all" ? "អនុញ្ញាតគ្រប់ប្រតិកម្ម (រួមទាំង 💩 🤮 👎)" : drift.state === "off" ? "បិទប្រតិកម្មទាំងអស់" : `មាន ${drift.extra.join(" ") || "—"} លើស${drift.missing.length ? ` · ខ្វះ ${drift.missing.join(" ")}` : ""}`
  return [
    `🛡️ ប្រតិកម្មក្នុង ${channel} មិនត្រូវតាមបញ្ជី`,
    `បច្ចុប្បន្ន៖ ${now}`,
    `ត្រូវការ៖ ${REQUIRED_REACTIONS.join(" ")}`,
    `អាចបន្ថែមបាន៖ ${OPTIONAL_REACTIONS.join(" ")}`,
    "",
    "របៀបកែ (បូតមិនអាចកែជំនួសបានទេ — Telegram មិនអនុញ្ញាត)៖",
    `១. បើក ${channel} › ចុចឈ្មោះ Channel › ✏️ Edit`,
    "២. Reactions › Some reactions",
    `៣. ជ្រើស ${REQUIRED_REACTIONS.join(" ")} (និង ${OPTIONAL_REACTIONS.join(" ")} បើចង់) › Save`,
  ].join("\n")
}

/** Links that may be posted: the app, the brand's channels and the bot. */
export const ALLOWED_LINKS = [/^(https?:\/\/)?(www\.)?(app\.)?luychlat\.com(\/|$)/i, /^(https?:\/\/)?(t|telegram)\.me\/(LuyChlatCommunity|LuyChlatIslamic|luychlat_bot)(\/|\?|$)/i]

/** A URL or a bare domain («bit.ly/x», «crypto-win.io», «t.me/+abc»), from the text or Telegram's entities. */
const URL_IN_TEXT = /\b(?:https?:\/\/|www\.)\S+|\b(?:t|telegram)\.me\/\S+|\b[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9-]{1,63})*\.(?:com|net|org|io|xyz|top|vip|cc|me|ly|gg|co|info|biz|club|site|online|shop|app|link|live|pro|bet|win|ru|cn|kh|asia)(?:\/\S*)?\b/gi

export type Entity = { type: string; offset: number; length: number; url?: string }

/** Every link in a message — typed URLs, hidden text links, and bare domains. */
export function linksIn(text: string, entities: Entity[] = []): string[] {
  const out = new Set<string>()
  for (const e of entities) {
    if (e.type === "text_link" && e.url) out.add(e.url)
    else if (e.type === "url") out.add(text.slice(e.offset, e.offset + e.length))
  }
  for (const m of text.matchAll(URL_IN_TEXT)) out.add(m[0].replace(/[).,!?»"']+$/, ""))
  return [...out]
}

export const isAllowedLink = (link: string) => ALLOWED_LINKS.some((r) => r.test(link.trim()))

/**
 * Abuse and spam phrases (lower case; Khmer as written). Only phrases that are a scam on their own — a money community
 * talks honestly about gambling and debt («ខ្ញុំឈប់ភ្នាល់ហើយ» must stay), and spam almost always carries a link, which
 * the link rule removes. Plus common English profanity. Khmer insults are added only from the founder's own list,
 * never guessed.
 */
export const BLOCKED_PHRASES = [
  // scams and crypto pumps
  "free crypto", "crypto signal", "usdt giveaway", "double your money", "guaranteed profit", "online casino", "កាស៊ីណូអនឡាញ", "ចំណេញធានា",
  // English profanity
  "fuck", "shit", "bitch", "bastard", "asshole", "dickhead", "motherfucker",
]

export function blockedPhrase(text: string): string | null {
  const t = text.toLowerCase()
  return BLOCKED_PHRASES.find((p) => (/^[a-z ]+$/.test(p) ? new RegExp(`\\b${p}\\b`).test(t) : t.includes(p))) ?? null
}

export type GuardMessage = {
  text?: string
  caption?: string
  entities?: Entity[]
  caption_entities?: Entity[]
  /** The channel's own post, forwarded into its discussion group by Telegram. */
  is_automatic_forward?: boolean
  from?: { id?: number; is_bot?: boolean }
  sender_chat?: { id: number }
}

export type GuardVerdict = { action: "allow" } | { action: "delete"; reason: "link" | "abuse"; detail: string }

/** One message in a discussion group: allowed, or deleted with the reason. Admins are decided by the caller. */
export function guardVerdict(m: GuardMessage, isAdmin: boolean): GuardVerdict {
  if (m.is_automatic_forward || isAdmin || m.from?.is_bot) return { action: "allow" }
  const text = m.text ?? m.caption ?? ""
  const bad = linksIn(text, m.entities ?? m.caption_entities ?? []).find((l) => !isAllowedLink(l))
  if (bad) return { action: "delete", reason: "link", detail: bad }
  const phrase = blockedPhrase(text)
  if (phrase) return { action: "delete", reason: "abuse", detail: phrase }
  return { action: "allow" }
}

/** A second deleted message within this window mutes the sender… */
export const FLOOD_WINDOW_MS = 10 * 60_000
/** …for this long. */
export const MUTE_MS = 24 * 3_600_000

/** The senders' recent deletions (per process — a restart forgives, which only errs towards the member). */
export function floodTracker(window = FLOOD_WINDOW_MS) {
  const seen = new Map<string, number[]>()
  return {
    /** Records a deletion; true when this sender should now be muted. */
    strike(chatId: number, userId: number, now: number): boolean {
      const key = `${chatId}:${userId}`
      const recent = (seen.get(key) ?? []).filter((t) => now - t < window)
      recent.push(now)
      seen.set(key, recent)
      return recent.length >= 2
    },
  }
}

/** The webhook's subscriptions — the same list in deploy/bot-activate.sh and /api/telegram/activate. */
export const ALLOWED_UPDATES = ["message", "edited_message", "callback_query", "my_chat_member", "message_reaction"] as const
