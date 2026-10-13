// Server only: preview-first channel posts with an auto-publish fallback (lib/scheduled-posts.ts).
//
//   T−45 min  the founder's private chat gets the preview: where it goes, the poster or text, and
//             [ 🚀 ផុសភ្លាមៗ ] / [ ❌ ផ្អាកថ្ងៃនេះ ]
//   button    publish now (Telegram Channel and/or Facebook Page) or pause today's post
//   T         nobody pressed anything → published by the timer
//
// Every post is a public.scheduled_posts row that leaves PENDING exactly once (bot_post_take), so a
// button pressed at 06:59:59 and the 07:00 timer can never both publish. The orchestration takes its
// I/O as `deps` so it is tested with an in-memory fake (scheduled-posts.test.ts).
import { holidayMessage, holidayMoment, holidayPostHtml } from "@/lib/holiday-lifecycle"
import {
  dueAction,
  parseScheduledPostCallback,
  plannedPosts,
  previewButtons,
  previewText,
  atMinute,
  type PostKind,
  type PostStatus,
  type Targets,
} from "@/lib/scheduled-posts"
import { getChannelPostButtons } from "@/lib/server/channel-buttons"
import { communityChat, morningPoster, morningText, publishMorningToFacebook, fbLog } from "@/lib/server/community-routine"
import { logEvent } from "@/lib/server/events"
import { facebookConfig, facebookHolidayMessage, publishLogged, publishPhotoToFacebook, publishTextToFacebook, shouldPublishToFacebook } from "@/lib/server/facebook-publisher"
import { holidayPoster } from "@/lib/server/holiday-poster"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { botDb, botKey, tg } from "@/lib/server/telegram-bot"
import { sendPosterPhoto } from "@/lib/server/tip-bot"

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
  get(id: number): Promise<PostRow | null>
  due(): Promise<PostRow[]>
  setPreviews(id: number, previews: Preview[]): Promise<void>
  adminChats(): Promise<number[]>
  /** The preview's content: the poster (or null for a text post) and the post as plain text. */
  content(row: PostRow): Promise<{ png: Buffer | null; body: string }>
  targets(row: PostRow): Targets
  publish(row: PostRow): Promise<void>
  sendPreview(chat: number, png: Buffer | null, text: string, buttons: ReturnType<typeof previewButtons>): Promise<number | null>
  editPreview(p: Preview, text: string, buttons: ReturnType<typeof previewButtons>): Promise<void>
  answer(callbackId: string, text: string, alert?: boolean): Promise<void>
  now(): number
  log(level: "info" | "warn" | "error", message: string): void
}

export type Callback = { id: string; data?: string; message?: { message_id: number; chat: { id: number; type: string } } }

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
    d.log(previews.length ? "info" : "warn", previews.length ? `Preview of ${row.kind} ${row.post_key} sent to ${previews.length} chat(s)` : `Preview of ${row.kind} ${row.post_key}: no super admin chat — it will publish at its time`)
  }

  async function refresh(row: PostRow) {
    const { text, buttons } = await render(row, row.status)
    for (const p of row.previews ?? []) await d.editPreview(p, text, buttons)
  }

  async function publishTaken(row: PostRow, how: string) {
    try {
      await d.publish(row)
      d.log("info", `${row.kind} ${row.post_key} published (${how})`)
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

  /** The timer: pending posts at (or past) their time are published once — or expired when far too late. */
  async function processDue() {
    for (const row of await d.due()) {
      const action = dueAction(row.publish_at, d.now())
      if (action === "wait") continue
      const taken = await d.take(row.id, action === "publish" ? "PUBLISHED" : "EXPIRED")
      if (!taken) continue // a button got there first
      if (action === "publish") await publishTaken(taken, "auto")
      else {
        d.log("warn", `${row.kind} ${row.post_key} expired unpublished (more than 90 min late)`)
        await refresh(taken)
      }
    }
  }

  /** Every minute: schedule what is in its preview window, then publish what is due. */
  async function tick(day: string, minutes: number) {
    for (const p of plannedPosts(day, minutes)) await schedulePost(p.kind, p.postKey, p.payload, atMinute(day, p.publishMinute))
    await processDue()
  }

  /** [ 🚀 ផុសភ្លាមៗ ] / [ ❌ ផ្អាកថ្ងៃនេះ ] — from a super admin's private chat only. */
  async function onCallback(cb: Callback) {
    const parsed = parseScheduledPostCallback(cb.data)
    const chat = cb.message?.chat
    if (!parsed || !chat || chat.type !== "private") return d.answer(cb.id, "")
    let taken: PostRow | null
    try {
      taken = await d.take(parsed.id, parsed.action === "publish" ? "PUBLISHED" : "PAUSED", chat.id)
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
  async adminChats() {
    const { data } = await botDb().rpc("bot_super_admin_chats", { p_key: botKey() })
    return ((data as { chat_id: number }[] | null) ?? []).map((c) => Number(c.chat_id))
  },
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
    if (row.kind === "MORNING") return { png: poster(() => morningPoster(String(row.payload.day))), body: stripHtml(morningText(String(row.payload.day))) }
    if (row.kind === "HOLIDAY") {
      const m = holidayOf(row)
      return { png: m ? poster(() => holidayPoster(m)) : null, body: m ? stripHtml(holidayPostHtml(m)) : "—" }
    }
    return { png: null, body: String(row.payload.telegram ?? "—") }
  },
  targets(row) {
    const fb = Boolean(facebookConfig())
    const telegram = Boolean(communityChat())
    if (row.kind === "MORNING") return { telegram, facebook: fb && shouldPublishToFacebook({ kind: "morning" }) }
    if (row.kind === "HOLIDAY") return { telegram, facebook: fb && shouldPublishToFacebook({ kind: "holiday" }) }
    return { telegram: telegram && Boolean(row.payload.telegram), facebook: fb && Boolean(row.payload.facebook) }
  },
  async publish(row) {
    const chat = communityChat()
    const buttons = await getChannelPostButtons()
    if (row.kind === "MORNING") {
      const day = String(row.payload.day)
      if (chat) {
        const id = await sendPosterPhoto(chat, morningPoster(day), morningText(day), { reply_markup: buttons.reply_markup })
        if (!id) await tg("sendMessage", { chat_id: chat, text: morningText(day), parse_mode: "HTML", disable_web_page_preview: true, ...buttons })
      }
      if (facebookConfig() && shouldPublishToFacebook({ kind: "morning" })) await publishMorningToFacebook(day)
      return
    }
    if (row.kind === "HOLIDAY") {
      const m = holidayOf(row)
      if (!m) return
      // The poster with the note as its caption (text only if the image can't be sent).
      const png = holidayPoster(m)
      if (chat) {
        const id = await sendPosterPhoto(chat, png, holidayPostHtml(m), { reply_markup: buttons.reply_markup })
        if (!id) await tg("sendMessage", { chat_id: chat, text: holidayPostHtml(m), parse_mode: "HTML", disable_web_page_preview: true, ...buttons })
      }
      if (facebookConfig() && shouldPublishToFacebook({ kind: "holiday" })) {
        const { title, body } = holidayMessage(m)
        await publishLogged(`holiday note (${row.post_key})`, () => publishPhotoToFacebook(png, facebookHolidayMessage(title, body)), fbLog)
      }
      return
    }
    if (chat && row.payload.telegram) await tg("sendMessage", { chat_id: chat, text: row.payload.telegram, disable_web_page_preview: true, ...buttons })
    const fbMessage = row.payload.facebook
    if (fbMessage && facebookConfig()) await publishLogged("fuel price change", () => publishTextToFacebook(fbMessage), fbLog)
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

let scheduler: ReturnType<typeof createScheduler> | null = null
const real = () => (scheduler ??= createScheduler(realDeps()))

/** Called every minute by the dispatcher. */
export async function scheduledPostsTick() {
  const now = phnomPenhToday()
  await real().tick(now.day, now.hour * 60 + now.minute)
}

/** A fuel price change: previewed now, published 45 minutes later unless the founder decides first. */
export const scheduleFuelPost = (noticeId: number, telegram: string, facebook: string | null, publishAt: string) =>
  real().schedulePost("FUEL", `notice-${noticeId}`, { telegram, facebook }, publishAt)

export { isScheduledPostCallback } from "@/lib/scheduled-posts"
export const handleScheduledPostCallback = (cb: Callback) => real().onCallback(cb)
