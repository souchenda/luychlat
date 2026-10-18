// Server only: preview-first channel posts, published ONLY with the founder's approval (lib/scheduled-posts.ts).
//
//   T−45 min  the founder's private chat gets the preview: where it goes, the poster or text, and
//             [ ✅ យល់ព្រម ] / [ 🚀 ផុសភ្លាមៗ ] / [ ❌ ផ្អាកថ្ងៃនេះ ]
//   button    approve (published at T), publish now, or pause today's post
//   T         approved → published by the timer; not approved → held, never published (founder, 18/10/2026)
//
// Every post is a public.scheduled_posts row that leaves PENDING exactly once (bot_post_take), so a
// button pressed at 06:59:59 and the 07:00 timer can never both publish. The orchestration takes its
// I/O as `deps` so it is tested with an in-memory fake (scheduled-posts.test.ts).
import { holidayMessage, holidayMoment, holidayPostHtml } from "@/lib/holiday-lifecycle"
import {
  dueAction,
  parseScheduledPostCallback,
  plannedIslamicPosts,
  plannedPosts,
  previewButtons,
  previewText,
  atMinute,
  EVENT_LEAD_MIN,
  type PostKind,
  type PostStatus,
  type Targets,
} from "@/lib/scheduled-posts"
import { getChannelPostButtons } from "@/lib/server/channel-buttons"
import { eveningText, morningPoster, morningText, publishMorningToFacebook, fbLog } from "@/lib/server/community-routine"
import { bulletinPreview, publishBulletin } from "@/lib/server/community-bulletin"
import { communityChannel, communityChannelConfigured, founderApproved, islamicChannel, islamicChannelConfigured } from "@/lib/server/channel"
import { toHijri, type HijriDate } from "@/lib/islamic"
import { dateOf, isIslamicKind, islamicCaptionHtml, islamicPlannedPosts, islamicPostContent, type IslamicKind } from "@/lib/islamic-channel"
import { islamicPoster, islamicPosterReady } from "@/lib/server/islamic-poster"
import { posterPreview, publishFestivalPoster } from "@/lib/server/festival-poster"
import { spotlightPoster } from "@/lib/server/spotlight-poster"
import { spotlightCaption, spotlightHtml } from "@/lib/spotlight"
import { logEvent } from "@/lib/server/events"
import { facebookConfig, facebookHolidayMessage, publishLogged, publishPhotoToFacebook, publishTextToFacebook, shouldPublishToFacebook } from "@/lib/server/facebook-publisher"
import { holidayPoster } from "@/lib/server/holiday-poster"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { sendMorningPush } from "@/lib/server/web-push"
import { botDb, botKey, tg } from "@/lib/server/telegram-bot"
import { sendPosterPhoto } from "@/lib/server/tip-bot"
import { marketingChats } from "@/lib/server/admin-routes"

export type Preview = { chat: number; msg: number; photo: boolean }
export type PostRow = {
  id: number
  kind: PostKind
  post_key: string
  payload: Record<string, string | null>
  publish_at: string
  status: PostStatus
  previews: Preview[]
}

export type SchedulerDeps = {
  schedule(kind: PostKind, postKey: string, payload: Record<string, string | null>, publishAt: string): Promise<(PostRow & { created: boolean }) | null>
  /** PENDING → status once; null when it had already left PENDING. Throws «super admin only» for another chat. */
  take(id: number, status: Exclude<PostStatus, "PENDING">, chatId?: number): Promise<PostRow | null>
  /** Where it went: the channel message id and the Facebook post id — so it can be edited or removed later. */
  recordIds(id: number, ids: Published): Promise<void>
  get(id: number): Promise<PostRow | null>
  due(): Promise<PostRow[]>
  setPreviews(id: number, previews: Preview[]): Promise<void>
  adminChats(): Promise<number[]>
  /** The preview's content: the poster (or null for a text post) and the post as plain text. */
  content(row: PostRow): Promise<{ png: Buffer | null; body: string }>
  targets(row: PostRow): Targets
  publish(row: PostRow): Promise<Published>
  sendPreview(chat: number, png: Buffer | null, text: string, buttons: ReturnType<typeof previewButtons>): Promise<number | null>
  editPreview(p: Preview, text: string, buttons: ReturnType<typeof previewButtons>): Promise<void>
  answer(callbackId: string, text: string, alert?: boolean): Promise<void>
  now(): number
  log(level: "info" | "warn" | "error", message: string): void
}

export type Published = { telegram: number | null; facebook: string | null }

export type Callback = { id: string; data?: string; from?: { id: number }; message?: { message_id: number; chat: { id: number; type: string } } }

export function createScheduler(d: SchedulerDeps) {
  async function render(row: PostRow, status: PostStatus) {
    const { png, body } = await d.content(row)
    const targets = d.targets(row)
    return { png, text: previewText({ kind: row.kind, targets, publishAt: row.publish_at, body, status }), buttons: previewButtons(row.id, status, targets) }
  }

  async function sendPreviews(row: PostRow) {
    const { png, text, buttons } = await render(row, "PENDING")
    const previews: Preview[] = []
    for (const chat of await d.adminChats()) {
      const msg = await d.sendPreview(chat, png, text, buttons)
      if (msg) previews.push({ chat, msg, photo: Boolean(png) })
    }
    await d.setPreviews(row.id, previews)
    d.log(previews.length ? "info" : "warn", previews.length ? `Preview of ${row.kind} ${row.post_key} sent to ${previews.length} chat(s)` : `Preview of ${row.kind} ${row.post_key}: no super admin chat — it can't be approved, so it will NOT be published`)
  }

  async function refresh(row: PostRow) {
    const { text, buttons } = await render(row, row.status)
    for (const p of row.previews ?? []) await d.editPreview(p, text, buttons)
  }

  async function publishTaken(row: PostRow, how: string) {
    try {
      const ids = await d.publish(row)
      await d.recordIds(row.id, ids)
      d.log("info", `${row.kind} ${row.post_key} published (${how}) · Telegram ${ids.telegram ?? "—"} · Facebook ${ids.facebook ?? "—"}`)
    } catch (e) {
      d.log("error", `${row.kind} ${row.post_key} publish failed (${how}): ${e instanceof Error ? e.message : String(e)}`)
    }
    await refresh(row)
  }

  /**
   * Schedule a post (idempotent). A pending post with no preview yet gets one while its time is still
   * ahead — a new one, or one re-armed for a fresh preview (status back to PENDING, previews emptied).
   */
  async function schedulePost(kind: PostKind, postKey: string, payload: Record<string, string | null>, publishAt: string) {
    const row = await d.schedule(kind, postKey, payload, publishAt)
    if (row && row.status === "PENDING" && !row.previews?.length && d.now() < Date.parse(row.publish_at) && (row.created || (await d.adminChats()).length))
      await sendPreviews(row)
    return row
  }

  /**
   * The timer: an APPROVED post at its time is published once; one nobody approved is held (never
   * published by the timer) and expires when far too late. The database refuses a timer publish of
   * anything not approved (bot_post_take), so this can never post an unvetted text.
   */
  async function processDue() {
    for (const row of await d.due()) {
      const action = dueAction(row.publish_at, d.now(), row.status)
      if (action === "wait" || action === "hold") continue
      const taken = await d.take(row.id, action === "publish" ? "PUBLISHED" : "EXPIRED")
      if (!taken) continue // a button got there first
      if (action === "publish") await publishTaken(taken, "approved")
      else {
        d.log("warn", `${row.kind} ${row.post_key} not published — ${row.status === "APPROVED" ? "approved but more than 90 min late" : "never approved"}`)
        await refresh(taken)
      }
    }
  }

  /** Every minute: schedule what is in its preview window, then publish what is due. */
  async function tick(day: string, minutes: number, hijriOf?: (day: string) => HijriDate | null) {
    // The Islamic channel's posts only when the Hijri calendar is given (the real tick); the same preview and gate.
    for (const p of [...plannedPosts(day, minutes), ...(hijriOf ? plannedIslamicPosts(day, minutes, hijriOf) : [])]) await schedulePost(p.kind, p.postKey, p.payload, atMinute(day, p.publishMinute))
    await processDue()
  }

  /** [ ✅ យល់ព្រម ] / [ 🚀 ផុសភ្លាមៗ ] / [ ❌ ផ្អាកថ្ងៃនេះ ] — from a super admin: their private chat, or the marketing group (the person who tapped is checked). */
  async function onCallback(cb: Callback) {
    const parsed = parseScheduledPostCallback(cb.data)
    const chat = cb.message?.chat
    const actor = chat?.type === "private" ? chat.id : cb.from?.id
    if (!parsed || !chat || !actor) return d.answer(cb.id, "")
    let taken: PostRow | null
    try {
      taken = await d.take(parsed.id, parsed.action === "publish" ? "PUBLISHED" : parsed.action === "approve" ? "APPROVED" : "PAUSED", actor)
    } catch (e) {
      return d.answer(cb.id, /super admin only/.test(e instanceof Error ? e.message : String(e)) ? "សម្រាប់ Super Admin ប៉ុណ្ណោះ។" : "មិនអាចរក្សាទុកបានទេ។ សូមសាកម្ដងទៀត។", true)
    }
    if (!taken) {
      const row = await d.get(parsed.id)
      const why = row?.status === "PUBLISHED" ? "✅ បានផ្សាយរួចហើយ។" : row?.status === "PAUSED" ? "❌ បានផ្អាករួចហើយ។" : row?.status === "EXPIRED" ? "⌛ ផុតពេលហើយ។" : "រកមិនឃើញការផ្សាយនេះទេ។"
      if (row) await refresh(row)
      return d.answer(cb.id, why, true)
    }
    if (parsed.action === "publish") {
      await d.answer(cb.id, "🚀 កំពុងផ្សាយ…")
      await publishTaken(taken, "founder")
    } else if (parsed.action === "approve") {
      await d.answer(cb.id, "✅ បានយល់ព្រម — នឹងផ្សាយតាមម៉ោង")
      await refresh(taken)
    } else {
      await d.answer(cb.id, "❌ បានផ្អាក")
      await refresh(taken)
    }
  }

  return { tick, processDue, schedulePost, onCallback }
}

// ─── The real bot ────────────────────────────────────────────────────────────

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

function holidayOf(row: PostRow) {
  const m = holidayMoment(String(row.payload.day))
  return m && m.stage === row.payload.stage ? m : null
}

const realDeps = (): SchedulerDeps => ({
  async schedule(kind, postKey, payload, publishAt) {
    const { data, error } = await botDb().rpc("bot_post_schedule", { p_key: botKey(), p_kind: kind, p_post_key: postKey, p_payload: payload, p_publish_at: publishAt })
    if (error) logEvent("error", "scheduled-posts", `Schedule ${kind} ${postKey} failed: ${error.message}`, { fold: true })
    return (data as (PostRow & { created: boolean }) | null) ?? null
  },
  async take(id, status, chatId) {
    const { data, error } = await botDb().rpc("bot_post_take", { p_key: botKey(), p_id: id, p_status: status, p_chat_id: chatId ?? null })
    if (error) throw new Error(error.message)
    const row = data as PostRow | null
    return row?.id ? row : null
  },
  async recordIds(id, ids) {
    const { error } = await botDb().rpc("bot_post_record_ids", { p_key: botKey(), p_id: id, p_telegram: ids.telegram, p_facebook: ids.facebook })
    if (error) logEvent("warn", "scheduled-posts", `Post ${id}: ids not recorded: ${error.message}`, { fold: true })
  },
  async get(id) {
    const { data } = await botDb().rpc("bot_post_get", { p_key: botKey(), p_id: id })
    const row = data as PostRow | null
    return row?.id ? row : null
  },
  async due() {
    const { data } = await botDb().rpc("bot_posts_due", { p_key: botKey() })
    return (data as PostRow[] | null) ?? []
  },
  async setPreviews(id, previews) {
    await botDb().rpc("bot_post_set_previews", { p_key: botKey(), p_id: id, p_previews: previews })
  },
  // The marketing chat (or topic) when set, else the super admins' private chats (lib/chat-route.ts).
  adminChats: () => marketingChats(),
  async content(row) {
    // The morning post and the holiday notes always preview as their poster; a drawing failure is
    // logged and the preview still goes out (as text) so the founder is never left without one.
    const poster = (draw: () => Buffer) => {
      try {
        return draw()
      } catch (e) {
        logEvent("error", "scheduled-posts", `Poster for ${row.kind} ${row.post_key} failed: ${e instanceof Error ? e.message : String(e)}`)
        return null
      }
    }
    const day = String(row.payload.day ?? "")
    switch (row.kind) {
      case "MORNING":
        return { png: poster(() => morningPoster(day)), body: stripHtml(morningText(day)) }
      case "HOLIDAY": {
        const m = holidayOf(row)
        return { png: m ? poster(() => holidayPoster(m)) : null, body: m ? stripHtml(holidayPostHtml(m)) : "—" }
      }
      case "EVENING":
        return { png: null, body: stripHtml(eveningText(day)) }
      case "SPOTLIGHT":
        return { png: poster(() => spotlightPoster()), body: stripHtml(spotlightHtml()) }
      case "BULLETIN":
      case "RATES":
        return { png: null, body: stripHtml(await bulletinPreview(row.kind)) }
      case "POSTER": {
        const p = posterPreview(String(row.payload.key))
        return { png: p?.png ?? null, body: p?.caption ?? "—" }
      }
      case "HOLYDAY":
        return { png: null, body: String(row.payload.text ?? "—") }
      case "ISLAMIC_DAILY":
      case "ISLAMIC_FAST":
      case "ISLAMIC_JUMUAH": {
        // The poster the channel will get, with its caption (founder, 18/10/2026: never text-only).
        const c = await islamicContent(row.kind, day)
        await islamicPosterReady
        return { png: poster(() => islamicPoster(c)), body: stripHtml(islamicCaptionHtml(c)) }
      }
      default:
        return { png: null, body: String(row.payload.telegram ?? "—") }
    }
  },
  targets(row) {
    // The Islamic channel's own posts: there only, never the general channel or the Page.
    if (isIslamicKind(row.kind)) return { telegram: islamicChannelConfigured(), facebook: false, channel: "islamic" }
    const fb = Boolean(facebookConfig())
    const telegram = communityChannelConfigured()
    if (row.kind === "MORNING") return { telegram, facebook: fb && shouldPublishToFacebook({ kind: "morning" }) }
    if (row.kind === "HOLIDAY") return { telegram, facebook: fb && shouldPublishToFacebook({ kind: "holiday" }) }
    if (row.kind === "SPOTLIGHT") return { telegram, facebook: fb && shouldPublishToFacebook({ kind: "spotlight" }) }
    if (row.kind === "EVENING" || row.kind === "BULLETIN" || row.kind === "RATES" || row.kind === "POSTER" || row.kind === "HOLYDAY") return { telegram, facebook: false }
    return { telegram: telegram && Boolean(row.payload.telegram), facebook: fb && Boolean(row.payload.facebook) }
  },
  async publish(row) {
    // Called only for a post the database let leave PENDING / APPROVED by the founder's decision
    // (bot_post_take): the approval that opens the channel and the Page.
    const approval = founderApproved(`${row.kind} ${row.post_key}`)
    // One routing rule (lib/islamic-channel.ts channelFor): Islamic posts → @LuyChlatIslamic, all else → the general channel.
    const islamic = isIslamicKind(row.kind)
    const chat = islamic ? islamicChannel(approval) : communityChannel(approval)
    const buttons = await getChannelPostButtons()
    const ids: Published = { telegram: null, facebook: null }
    const sentText = async (text: string, html: boolean) => {
      const res = await tg<{ message_id: number }>("sendMessage", { chat_id: chat, text, ...(html ? { parse_mode: "HTML" } : {}), disable_web_page_preview: true, ...buttons })
      return res.ok && res.result ? res.result.message_id : null
    }
    if (islamic) {
      // The poster with its caption (text only if the image can't be sent, so the post is never lost).
      const c = await islamicContent(row.kind as IslamicKind, String(row.payload.day))
      await islamicPosterReady
      const caption = islamicCaptionHtml(c)
      if (chat) ids.telegram = (await sendPosterPhoto(chat, islamicPoster(c), caption, { reply_markup: buttons.reply_markup })) ?? (await sentText(caption, true))
      return ids
    }
    if (row.kind === "MORNING") {
      const day = String(row.payload.day)
      if (chat) ids.telegram = (await sendPosterPhoto(chat, morningPoster(day), morningText(day), { reply_markup: buttons.reply_markup })) ?? (await sentText(morningText(day), true))
      if (facebookConfig() && shouldPublishToFacebook({ kind: "morning" })) {
        const fb = await publishMorningToFacebook(approval, day)
        if (fb?.ok) ids.facebook = fb.postId
      }
      // Phones that turned on notifications: the same quote, only now that it is published (a pause
      // stops it too) and once a day. The in-app ☀️ card follows the same status (morning_post_published).
      const { data: first } = await botDb().rpc("bot_claim_daily", { p_key: botKey(), p_job: "push-morning", p_day: day })
      if (first === true) await sendMorningPush()
      return ids
    }
    if (row.kind === "HOLIDAY") {
      const m = holidayOf(row)
      if (!m) return ids
      // The poster with the note as its caption (text only if the image can't be sent).
      const png = holidayPoster(m)
      if (chat) ids.telegram = (await sendPosterPhoto(chat, png, holidayPostHtml(m), { reply_markup: buttons.reply_markup })) ?? (await sentText(holidayPostHtml(m), true))
      if (facebookConfig() && shouldPublishToFacebook({ kind: "holiday" })) {
        const { title, body } = holidayMessage(m)
        const fb = await publishLogged(`holiday note (${row.post_key})`, () => publishPhotoToFacebook(approval, png, facebookHolidayMessage(title, body)), fbLog)
        if (fb?.ok) ids.facebook = fb.postId
      }
      return ids
    }
    if (row.kind === "EVENING") {
      if (chat) ids.telegram = await sentText(eveningText(String(row.payload.day)), true)
      return ids
    }
    if (row.kind === "SPOTLIGHT") {
      const png = spotlightPoster()
      if (chat) ids.telegram = (await sendPosterPhoto(chat, png, spotlightHtml(), { reply_markup: buttons.reply_markup })) ?? (await sentText(spotlightHtml(), true))
      if (facebookConfig() && shouldPublishToFacebook({ kind: "spotlight" })) {
        const fb = await publishLogged("weekly spotlight", () => publishPhotoToFacebook(approval, png, spotlightCaption()), fbLog)
        if (fb?.ok) ids.facebook = fb.postId
      }
      return ids
    }
    if (row.kind === "BULLETIN" || row.kind === "RATES") {
      ids.telegram = await publishBulletin(approval, row.kind)
      return ids
    }
    if (row.kind === "POSTER") {
      ids.telegram = await publishFestivalPoster(approval, String(row.payload.key))
      return ids
    }
    if (row.kind === "HOLYDAY") {
      if (chat && row.payload.text) ids.telegram = await sentText(String(row.payload.text), false)
      return ids
    }
    if (chat && row.payload.telegram) ids.telegram = await sentText(row.payload.telegram, false)
    const fbMessage = row.payload.facebook
    if (fbMessage && facebookConfig()) {
      const fb = await publishLogged("fuel price change", () => publishTextToFacebook(approval, fbMessage), fbLog)
      if (fb?.ok) ids.facebook = fb.postId
    }
    return ids
  },
  async sendPreview(chat, png, text, buttons) {
    const reply_markup = { inline_keyboard: buttons }
    if (png) return await sendPosterPhoto(chat, png, text.slice(0, 1024), { reply_markup })
    const res = await tg<{ message_id: number }>("sendMessage", { chat_id: chat, text, disable_web_page_preview: true, reply_markup })
    return res.ok && res.result ? res.result.message_id : null
  },
  async editPreview(p, text, buttons) {
    const reply_markup = { inline_keyboard: buttons }
    if (p.photo) await tg("editMessageCaption", { chat_id: p.chat, message_id: p.msg, caption: text.slice(0, 1024), reply_markup })
    else await tg("editMessageText", { chat_id: p.chat, message_id: p.msg, text, disable_web_page_preview: true, reply_markup })
  },
  async answer(callbackId, text, alert = false) {
    await tg("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}) })
  },
  now: () => Date.now(),
  log: (level, message) => logEvent(level, "scheduled-posts", message),
})

// ─── The Islamic channel's posts ──────────────────────────────────────────────────────────────────

let hijriOffsetCache: { value: number; at: number } | null = null
/** The admin's Hijri offset (Super Admin › Islamic defaults), cached for 30 minutes — the same day as in the app. */
async function hijriOffset(): Promise<number> {
  if (hijriOffsetCache && Date.now() - hijriOffsetCache.at < 30 * 60_000) return hijriOffsetCache.value
  const { data } = await botDb().rpc("bot_islamic_defaults", { p_key: botKey() })
  const value = Number((data as { hijri_offset?: string } | null)?.hijri_offset ?? 0) || 0
  hijriOffsetCache = { value, at: Date.now() }
  return value
}
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

/** One Islamic post's content (poster and caption), with the admin's Hijri offset. */
async function islamicContent(kind: IslamicKind, day: string) {
  const offset = await hijriOffset()
  return islamicPostContent(kind, day, toHijri(dateOf(day), offset), toHijri(dateOf(nextDay(day)), offset))
}

let scheduler: ReturnType<typeof createScheduler> | null = null
const real = () => (scheduler ??= createScheduler(realDeps()))

/** Called every minute by the dispatcher. */
export async function scheduledPostsTick() {
  const now = phnomPenhToday()
  const offset = await hijriOffset()
  await real().tick(now.day, now.hour * 60 + now.minute, (d) => toHijri(dateOf(d), offset))
}

/**
 * /islamicpreview (admins): today's Islamic-channel posts whose time is still ahead are scheduled and previewed
 * NOW instead of 45 minutes before — published only on ✅ / 🚀 as always. Already previewed → not sent again
 * (schedulePost is idempotent), so the regular tick later never duplicates it.
 */
export async function previewIslamicNow(): Promise<string[]> {
  const now = phnomPenhToday()
  const minutes = now.hour * 60 + now.minute
  const offset = await hijriOffset()
  const plans = islamicPlannedPosts(now.day, (d) => toHijri(dateOf(d), offset), (at) => minutes < at)
  const out: string[] = []
  for (const p of plans) {
    const row = await real().schedulePost(p.kind, p.postKey, p.payload, atMinute(now.day, p.publishMinute))
    out.push(`${p.kind} ${p.postKey} → ${row ? `${row.status}${row.created ? " (ថ្មី)" : " (មានរួចហើយ)"}` : "មិនអាចរៀបចំបានទេ"}`)
  }
  return out
}

/** A fuel price change: previewed now; published only once the founder approves (at the earliest 45 minutes later, or at once with 🚀). */
export const scheduleFuelPost = (noticeId: number, telegram: string, facebook: string | null, publishAt: string) =>
  real().schedulePost("FUEL", `notice-${noticeId}`, { telegram, facebook }, publishAt)

/**
 * An event-driven post (the bulletin, the evening NBC rates, a festival poster, a holy-day note, an
 * unchanged fuel notice): held for the founder's approval — previewed at once, published only on ✅ / 🚀,
 * within 90 minutes.
 */
export const holdForApproval = (kind: PostKind, postKey: string, payload: Record<string, string | null>) =>
  real().schedulePost(kind, postKey, payload, new Date(Date.now() + EVENT_LEAD_MIN * 60_000).toISOString())

export { isScheduledPostCallback } from "@/lib/scheduled-posts"
export const handleScheduledPostCallback = (cb: Callback) => real().onCallback(cb)
