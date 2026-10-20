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
import { createHash } from "node:crypto"

import { holidayMessage, holidayMoment, holidayPostHtml } from "@/lib/holiday-lifecycle"
import {
  dueAction,
  isAutoPublish,
  isReplaceCallback,
  kmClock,
  parseReplaceCallback,
  parseScheduledPostCallback,
  REPLACEABLE,
  replaceButtons,
  replacedNote,
  replacePreviewText,
  reminderLevel,
  urgentReminderButtons,
  urgentReminderText,
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
import { eveningButtons } from "@/lib/evening-reminder"
import { getChannelPostButtons } from "@/lib/server/channel-buttons"
import { eveningText, morningPoster, morningText, publishMorningToFacebook, fbLog } from "@/lib/server/community-routine"
import { bulletinPreview, islamicBulletinText, publishBulletin } from "@/lib/server/community-bulletin"
import { communityChannel, communityChannelConfigured, founderApproved, islamicChannel, islamicChannelConfigured } from "@/lib/server/channel"
import { formatHijri, toHijri, type HijriDate } from "@/lib/islamic"
import { channelFor, dateOf, isIslamicKind, islamicCaptionHtml, kmDay, islamicPlannedPosts, islamicPostContent, type IslamicKind } from "@/lib/islamic-channel"
import { islamicPoster, islamicPosterReady } from "@/lib/server/islamic-poster"
import { silPosterContent } from "@/lib/sil-poster"
import { renderSilPoster, silPosterReady } from "@/lib/server/sil-poster"
import { quizTeaserButtons, quizTeaserHtml } from "@/lib/islamic-quiz"
import { dilemmaOfDay, dilemmaPostText } from "@/lib/money-dilemmas"
import { posterPreview, publishFestivalPoster } from "@/lib/server/festival-poster"
import { spotlightPoster } from "@/lib/server/spotlight-poster"
import { spotlightCaption, spotlightHtml } from "@/lib/spotlight"
import { logEvent } from "@/lib/server/events"
import { deleteFacebookPost, facebookConfig, facebookHolidayMessage, publishLogged, publishPhotoToFacebook, publishTextToFacebook, shouldPublishToFacebook } from "@/lib/server/facebook-publisher"
import { holidayPoster } from "@/lib/server/holiday-poster"
import { nationalAssetsFor, nationalAssetsReady, nationalDayPoster } from "@/lib/server/national-day-poster"
import { nationalCaptionHtml, nationalCaptionText, nationalDayByKey, nationalDaysToPreview, PUBLISH_MINUTE } from "@/lib/calendar/cambodia-holidays"
import { phnomPenhToday } from "@/lib/server/market-sync"
import { sendMorningPush } from "@/lib/server/web-push"
import { botDb, botKey, tg } from "@/lib/server/telegram-bot"
import { sendPosterPhoto } from "@/lib/server/tip-bot"
import { founderChats, marketingChats } from "@/lib/server/admin-routes"

export type Preview = { chat: number; msg: number; photo: boolean }
export type PostRow = {
  id: number
  kind: PostKind
  post_key: string
  payload: Record<string, string | null>
  publish_at: string
  status: PostStatus
  previews: Preview[]
  /** Who tapped ✅ / 🚀 / ❌ (bot_post_set_decider) and when (decided_at, set by bot_post_take). */
  decided_name?: string | null
  decided_username?: string | null
  decided_at?: string | null
  decided_how?: "approve" | "publish" | "pause" | null
  /** Where it went and what was published — for REPLACE OLD WITH NEW (migration 20270200000000). */
  telegram_message_id?: number | null
  facebook_post_id?: string | null
  content_hash?: string | null
  replace_status?: "PENDING" | "APPROVED" | "REPLACING" | "DONE" | "KEPT" | null
  /** Urgent reminders sent while it waited past its time (bot_post_remind_claim). */
  reminders?: number
}

/** REPLACE OLD WITH NEW (founder, 20/10/2026) — optional, so a test harness without it still runs the rest. */
export type ReplaceDeps = {
  publishedToday(): Promise<PostRow[]>
  /** What the post would publish now (poster and caption), or null for a kind that is never replaced. */
  contentHash(row: PostRow): Promise<string | null>
  setHash(id: number, hash: string): Promise<void>
  /** Asks once (PENDING); false when it was already asked or is being replaced. */
  replaceAsk(id: number): Promise<boolean>
  /** An approver's 🔄 / ❌; throws «super admin only» for anyone else. */
  replaceDecide(id: number, replace: boolean, chatId: number): Promise<string>
  /** The approved replacements, each claimed once. */
  replaceTake(): Promise<PostRow[]>
  /** Deletes the old message (and Page post); true when the old one is gone. */
  unpublish(row: PostRow): Promise<boolean>
  replaceDone(id: number, ok: boolean, ids: Published, hash: string | null, removed: boolean): Promise<void>
  /** The founder's private chat: the replacement's outcome. */
  notify(text: string): Promise<void>
}

export type SchedulerDeps = {
  schedule(kind: PostKind, postKey: string, payload: Record<string, string | null>, publishAt: string): Promise<(PostRow & { created: boolean }) | null>
  /** PENDING → status once; null when it had already left PENDING. Throws «super admin only» for another chat. */
  take(id: number, status: Exclude<PostStatus, "PENDING">, chatId?: number): Promise<PostRow | null>
  /** Where it went: the channel message id and the Facebook post id — so it can be edited or removed later. */
  recordIds(id: number, ids: Published): Promise<void>
  /** The Telegram name and @username of the person who decided — labels the card; the audit log already has it. */
  setDecider?(id: number, tg: number, name: string | null, username: string | null, how: "approve" | "publish" | "pause"): Promise<void>
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
  replace?: ReplaceDeps
  /** The founder's urgent reminders for a post still waiting at its time (founder, 20/10/2026). */
  remind?: { claim(id: number, level: number): Promise<boolean>; founderChats(): Promise<number[]> }
}

export type Published = { telegram: number | null; facebook: string | null }

export type Callback = { id: string; data?: string; from?: { id: number; first_name?: string; last_name?: string; username?: string }; message?: { message_id: number; photo?: unknown[]; chat: { id: number; type: string } } }

export function createScheduler(d: SchedulerDeps) {
  async function render(row: PostRow, status: PostStatus) {
    const { png, body } = await d.content(row)
    const targets = d.targets(row)
    const decider = { name: row.decided_name ?? null, username: row.decided_username ?? null, at: row.decided_at ?? null, how: row.decided_how ?? null }
    return { png, text: previewText({ kind: row.kind, targets, publishAt: row.publish_at, body, status, decider }), buttons: previewButtons(row.id, status, targets, row.kind) }
  }

  async function sendPreviews(row: PostRow) {
    const { png, text, buttons } = await render(row, row.status)
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
      // What was published, so a later, better version of today's post is noticed (REPLACE OLD WITH NEW).
      const hash = d.replace ? await d.replace.contentHash(row) : null
      if (hash) await d.replace!.setHash(row.id, hash)
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
    // Only a post that waits for the founder's decision is previewed. The factual feeds (AUTO_PUBLISH_KINDS: the
    // market bulletin, the evening NBC rates, the 05:30 prayer times) are created APPROVED and publish silently at
    // their time — nothing reaches the approval room (founder, 19/10/2026).
    const previewable = row?.status === "PENDING" && !isAutoPublish(row.kind)
    if (row && previewable && !row.previews?.length && d.now() < Date.parse(row.publish_at) && (row.created || (await d.adminChats()).length))
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
      if (action === "hold") await remindFounder(row)
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

  /**
   * A post still waiting at its time (founder, 20/10/2026): NOT published — an urgent reminder goes to the founder's
   * private chat (at its time, again an hour later), each claimed once, with [ ✅ អនុម័ត និងផ្សាយឥឡូវនេះ ]
   * [ ❌ ផ្អាកថ្ងៃនេះ ]. The card joins the post's previews, so his tap updates it and the «LCA Approval» card alike.
   */
  async function remindFounder(row: PostRow) {
    const r = d.remind
    const level = reminderLevel(row.publish_at, d.now())
    if (!r || row.status !== "PENDING" || level === 0 || (row.reminders ?? 0) >= level) return
    if (!(await r.claim(row.id, level))) return
    const { body } = await d.content(row)
    const title = body.split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 90) ?? ""
    const text = urgentReminderText({ kind: row.kind, title, publishAt: row.publish_at, level: level as 1 | 2 })
    const added: Preview[] = []
    for (const chat of await r.founderChats()) {
      const msg = await d.sendPreview(chat, null, text, urgentReminderButtons(row.id))
      if (msg) added.push({ chat, msg, photo: false })
    }
    if (added.length) await d.setPreviews(row.id, [...(row.previews ?? []), ...added])
    d.log(added.length ? "warn" : "error", `${row.kind} ${row.post_key} waiting at its time — urgent reminder ${level} sent to ${added.length} founder chat(s)`)
  }

  /** Every minute: schedule what is in its preview window, then publish what is due. */
  async function tick(day: string, minutes: number, hijriOf?: (day: string) => HijriDate | null) {
    // The Islamic channel's posts only when the Hijri calendar is given (the real tick); the same preview and gate.
    for (const p of [...plannedPosts(day, minutes), ...(hijriOf ? plannedIslamicPosts(day, minutes, hijriOf) : [])]) await schedulePost(p.kind, p.postKey, p.payload, atMinute(day, p.publishMinute))
    await processDue()
    await replaceDue()
    await checkVersions()
  }

  /**
   * REPLACE OLD WITH NEW (founder, 20/10/2026): an approved replacement is published first, then the old message is
   * deleted — the post is never missing; if the new one can't be sent, the old stays and it is tried again.
   */
  async function replaceDue() {
    const r = d.replace
    if (!r) return
    for (const row of await r.replaceTake()) {
      let ids: Published = { telegram: null, facebook: null }
      try {
        ids = await d.publish(row)
      } catch (e) {
        d.log("error", `${row.kind} ${row.post_key} replacement not published: ${e instanceof Error ? e.message : String(e)}`)
      }
      if (!ids.telegram && !ids.facebook) {
        await r.replaceDone(row.id, false, ids, null, false)
        d.log("warn", `${row.kind} ${row.post_key}: the new version was not sent — the old post stays, retried next minute`)
        continue
      }
      const removed = await r.unpublish(row)
      await r.replaceDone(row.id, true, ids, await r.contentHash(row), removed)
      d.log(removed ? "info" : "warn", `${row.kind} ${row.post_key} replaced · new Telegram ${ids.telegram ?? "—"} · old ${row.telegram_message_id ?? "—"} ${removed ? "deleted" : "NOT deleted"}`)
      await r.notify(replacedNote(row.kind, row.post_key, { removed, telegram: ids.telegram }))
    }
  }

  // Each published version is compared once per process (a deploy brings the new code — that is when it changes).
  const compared = new Map<number, string>()
  /** Today's published posts whose content is now different: the new version is previewed with [ 🔄 ] [ ❌ ]. */
  async function checkVersions() {
    const r = d.replace
    if (!r) return
    for (const row of await r.publishedToday()) {
      if (!row.content_hash || !REPLACEABLE(row.kind) || compared.get(row.id) === row.content_hash) continue
      if (row.replace_status === "PENDING" || row.replace_status === "APPROVED" || row.replace_status === "REPLACING") continue
      compared.set(row.id, row.content_hash)
      const now = await r.contentHash(row)
      if (!now || now === row.content_hash || !(await r.replaceAsk(row.id))) continue
      const { png, body } = await d.content(row)
      let sent = 0
      for (const chat of await d.adminChats()) if (await d.sendPreview(chat, png, replacePreviewText(row.kind, body), replaceButtons(row.id))) sent++
      d.log(sent ? "info" : "warn", `${row.kind} ${row.post_key}: a new version — the replacement preview sent to ${sent} chat(s)`)
    }
  }

  /** [ 🔄 ជំនួសដោយកំណែថ្មី ] / [ ❌ រក្សាកំណែចាស់ ] — an approver's tap (checked and audited in the database). */
  async function onReplaceCallback(cb: Callback) {
    const parsed = parseReplaceCallback(cb.data)
    const chat = cb.message?.chat
    const actor = chat?.type === "private" ? chat.id : cb.from?.id
    const r = d.replace
    if (!parsed || !chat || !actor || !r) return d.answer(cb.id, "")
    let status: string
    try {
      status = await r.replaceDecide(parsed.id, parsed.replace, actor)
    } catch (e) {
      return d.answer(cb.id, /super admin only/.test(e instanceof Error ? e.message : String(e)) ? "សម្រាប់អ្នកអនុម័តប៉ុណ្ណោះ។" : "មិនអាចរក្សាទុកបានទេ។ សូមសាកម្ដងទៀត។", true)
    }
    const who = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(" ").trim() || (cb.from?.username ? `@${cb.from.username}` : "—")
    const at = kmClock(new Date(d.now()).toISOString())
    if (cb.message) {
      const line = status === "APPROVED" ? `🔄 បានយល់ព្រមឱ្យជំនួសដោយ៖ 👤 ${who} · ⏰ ${at}` : status === "KEPT" ? `❌ រក្សាកំណែចាស់ដោយ៖ 👤 ${who} · ⏰ ${at}` : "✅ បានសម្រេចរួចហើយ"
      await d.editPreview({ chat: chat.id, msg: cb.message.message_id, photo: Boolean(cb.message.photo) }, line, [])
    }
    if (status === "KEPT") {
      // The newer version was seen and kept out: not asked again for it.
      const row = await d.get(parsed.id)
      const hash = row ? await r.contentHash(row) : null
      if (hash) await r.setHash(parsed.id, hash)
      return d.answer(cb.id, "❌ រក្សាកំណែចាស់")
    }
    await d.answer(cb.id, status === "APPROVED" ? "🔄 កំពុងជំនួស…" : "បានសម្រេចរួចហើយ។")
    if (status === "APPROVED") await replaceDue()
  }

  /** [ ✅ យល់ព្រម ] / [ 🚀 ផុសភ្លាមៗ ] / [ ❌ ផ្អាកថ្ងៃនេះ ] — from a super admin: their private chat, or the marketing group (the person who tapped is checked). */
  async function onCallback(cb: Callback) {
    if (isReplaceCallback(cb.data)) return onReplaceCallback(cb)
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
    // The card names who decided and when, for every approver in «LCA Approval» (founder, 20/10/2026).
    const how = parsed.action === "publish" ? "publish" : parsed.action === "approve" ? "approve" : "pause"
    const tgId = cb.from?.id ?? actor
    const name = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(" ").trim() || null
    const username = cb.from?.username ?? null
    await d.setDecider?.(taken.id, tgId, name, username, how)
    taken = { ...taken, decided_name: name, decided_username: username, decided_at: new Date(d.now()).toISOString(), decided_how: how }
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

  return { tick, processDue, schedulePost, onCallback, replaceDue, checkVersions }
}

// ─── The real bot ────────────────────────────────────────────────────────────

/** A holy-day post on the Sil day itself (not the eve): its poster content (lib/sil-poster.ts), else null. */
function silDayOf(row: PostRow) {
  if (row.kind !== "HOLYDAY" || !row.post_key.startsWith("holy-day-today")) return null
  const day = String(row.payload.day ?? row.post_key.slice(-10))
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? silPosterContent(day) : null
}

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
  async setDecider(id, tg, name, username, how) {
    const { error } = await botDb().rpc("bot_post_set_decider", { p_key: botKey(), p_id: id, p_tg: tg, p_name: name, p_username: username, p_how: how })
    if (error) logEvent("warn", "scheduled-posts", `Post ${id}: decider not recorded: ${error.message}`, { fold: true })
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
      case "HOLYDAY": {
        const sil = silDayOf(row)
        if (sil) await silPosterReady
        return { png: sil ? poster(() => renderSilPoster(sil)) : null, body: String(row.payload.text ?? "—") }
      }
      case "DILEMMA":
        return { png: null, body: dilemmaPostText(dilemmaOfDay(day)) }
      case "NATIONAL_DAY": {
        // A national day or royal ceremony (founder, 20/10/2026): the poster and its caption.
        const d = nationalDayByKey(String(row.payload.key))
        const day = String(row.payload.day ?? "")
        if (!d) return { png: null, body: "—" }
        await nationalAssetsReady
        // The approver is told when an official portrait the day should carry is not on the server yet.
        const missing = d.assets?.portrait && !nationalAssetsFor(d).portrait ? "\n\nℹ️ មិនទាន់មានព្រះឆាយាល័ក្ខណ៍ផ្លូវការលើ Server ទេ (public/images/holidays) — ផ្ទាំងនេះជាអក្សរ។" : ""
        return { png: poster(() => nationalDayPoster(d, day).png), body: nationalCaptionText(d, day) + missing }
      }
      case "ISLAMIC_BULLETIN":
        return { png: null, body: stripHtml((await islamicBulletinNow()) ?? "—") }
      case "ISLAMIC_QUIZ":
        // A short teaser with a button into the in-app quiz (no poster).
        return { png: null, body: stripHtml(quizTeaserHtml(day)) }
      case "ISLAMIC_MORNING":
      case "ISLAMIC_DAILY":
      case "ISLAMIC_JUMUAH":
      case "ISLAMIC_IFTAR":
      case "ISLAMIC_FAST":
      case "ISLAMIC_NIGHT": {
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
    if (channelFor(row.kind) === "islamic") return { telegram: islamicChannelConfigured(), facebook: false, channel: "islamic" }
    const fb = Boolean(facebookConfig())
    const telegram = communityChannelConfigured()
    if (row.kind === "MORNING") return { telegram, facebook: fb && shouldPublishToFacebook({ kind: "morning" }) }
    if (row.kind === "NATIONAL_DAY") return { telegram, facebook: fb && shouldPublishToFacebook({ kind: "national" }) }
    if (row.kind === "HOLIDAY") return { telegram, facebook: fb && shouldPublishToFacebook({ kind: "holiday" }) }
    if (row.kind === "SPOTLIGHT") return { telegram, facebook: fb && shouldPublishToFacebook({ kind: "spotlight" }) }
    if (row.kind === "DILEMMA") return { telegram, facebook: fb && shouldPublishToFacebook({ kind: "dilemma" }) }
    // The Sil day poster goes to the Page too (founder, 19/10/2026); the eve note stays on the channel.
    if (row.kind === "HOLYDAY" && silDayOf(row)) return { telegram, facebook: fb && shouldPublishToFacebook({ kind: "silday" }) }
    if (row.kind === "EVENING" || row.kind === "BULLETIN" || row.kind === "RATES" || row.kind === "POSTER" || row.kind === "HOLYDAY") return { telegram, facebook: false }
    return { telegram: telegram && Boolean(row.payload.telegram), facebook: fb && Boolean(row.payload.facebook) }
  },
  async publish(row) {
    // Called only for a post the database let leave PENDING / APPROVED by the founder's decision
    // (bot_post_take): the approval that opens the channel and the Page.
    const approval = founderApproved(`${row.kind} ${row.post_key}`)
    // One routing rule (lib/islamic-channel.ts channelFor): Islamic posts → @LuyChlatIslamic, all else → the general channel.
    const islamic = channelFor(row.kind) === "islamic"
    const chat = islamic ? islamicChannel(approval) : communityChannel(approval)
    const buttons = await getChannelPostButtons()
    const ids: Published = { telegram: null, facebook: null }
    const sentText = async (text: string, html: boolean) => {
      const res = await tg<{ message_id: number }>("sendMessage", { chat_id: chat, text, ...(html ? { parse_mode: "HTML" } : {}), disable_web_page_preview: true, ...buttons })
      return res.ok && res.result ? res.result.message_id : null
    }
    if (row.kind === "ISLAMIC_QUIZ") {
      // The in-app quiz's teaser: a light text with one button into the app (founder, 18/10/2026).
      if (chat) {
        const res = await tg<{ message_id: number }>("sendMessage", {
          chat_id: chat,
          text: quizTeaserHtml(String(row.payload.day)),
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: quizTeaserButtons(),
        })
        ids.telegram = res.ok && res.result ? res.result.message_id : null
      }
      return ids
    }
    if (row.kind === "NATIONAL_DAY") {
      // The commemoration poster: the community channel and the Page, once approved (founder, 20/10/2026).
      const d = nationalDayByKey(String(row.payload.key))
      const day = String(row.payload.day ?? "")
      if (!d) return ids
      await nationalAssetsReady
      const png = nationalDayPoster(d, day).png
      if (chat) ids.telegram = (await sendPosterPhoto(chat, png, nationalCaptionHtml(d, day), { reply_markup: buttons.reply_markup })) ?? (await sentText(nationalCaptionHtml(d, day), true))
      if (facebookConfig() && shouldPublishToFacebook({ kind: "national" })) {
        const fb = await publishLogged(`national day ${d.key} ${day}`, () => publishPhotoToFacebook(approval, png, nationalCaptionText(d, day)), fbLog)
        if (fb?.ok) ids.facebook = fb.postId
      }
      return ids
    }
    if (row.kind === "ISLAMIC_BULLETIN") {
      // The Islamic market bulletin (founder, 20/10/2026): @LuyChlatIslamic only — never the general channel.
      const text = await islamicBulletinNow()
      if (chat && text) ids.telegram = await sentText(text, true)
      return ids
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
      // A light text message with ONE button to the bot (lib/evening-reminder.ts eveningButtons).
      if (chat) {
        const res = await tg<{ message_id: number }>("sendMessage", {
          chat_id: chat,
          text: eveningText(String(row.payload.day)),
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: eveningButtons(),
        })
        ids.telegram = res.ok && res.result ? res.result.message_id : null
      }
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
    if (row.kind === "DILEMMA") {
      // The same plain text on the community channel and the Facebook Page.
      const text = dilemmaPostText(dilemmaOfDay(String(row.payload.day)))
      if (chat) ids.telegram = await sentText(text, false)
      if (facebookConfig() && shouldPublishToFacebook({ kind: "dilemma" })) {
        const fb = await publishLogged(`money dilemma (${row.post_key})`, () => publishTextToFacebook(approval, text), fbLog)
        if (fb?.ok) ids.facebook = fb.postId
      }
      return ids
    }
    if (row.kind === "HOLYDAY") {
      // A Buddhist post: the community channel (`chat` — never @LuyChlatIslamic, channelFor) and, on the Sil day, the Page.
      const sil = silDayOf(row)
      if (sil) {
        await silPosterReady
        const png = renderSilPoster(sil)
        const caption = String(row.payload.text ?? sil.title)
        if (chat) ids.telegram = (await sendPosterPhoto(chat, png, caption)) ?? (await sentText(caption, false))
        if (facebookConfig() && shouldPublishToFacebook({ kind: "silday" })) {
          const fb = await publishLogged(`Sil day poster (${row.post_key})`, () => publishPhotoToFacebook(approval, png, caption), fbLog)
          if (fb?.ok) ids.facebook = fb.postId
        }
        return ids
      }
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

/** REPLACE OLD WITH NEW on the real bot: the database (migration 20270200000000), the channel and the Page. */
function withReplace(base: SchedulerDeps): SchedulerDeps {
  const rows = (data: unknown) => ((data as PostRow[] | null) ?? []).filter((r) => r?.id)
  const replace: ReplaceDeps = {
    async publishedToday() {
      const { data } = await botDb().rpc("bot_posts_published_today", { p_key: botKey() })
      return rows(data)
    },
    async contentHash(row) {
      if (!REPLACEABLE(row.kind)) return null
      const { png, body } = await base.content(row)
      return createHash("sha256").update(png ?? Buffer.alloc(0)).update(body).digest("hex")
    },
    async setHash(id, hash) {
      await botDb().rpc("bot_post_set_hash", { p_key: botKey(), p_id: id, p_hash: hash })
    },
    async replaceAsk(id) {
      const { data } = await botDb().rpc("bot_post_replace_ask", { p_key: botKey(), p_id: id })
      return data === true
    },
    async replaceDecide(id, replace, chatId) {
      const { data, error } = await botDb().rpc("bot_post_replace_decide", { p_key: botKey(), p_id: id, p_replace: replace, p_chat_id: chatId })
      if (error) throw new Error(error.message)
      return String(data)
    },
    async replaceTake() {
      const { data } = await botDb().rpc("bot_post_replace_take", { p_key: botKey() })
      return rows(data)
    },
    async unpublish(row) {
      // The replacement was approved (bot_post_replace_decide, or the founder's own instruction — audited).
      const approval = founderApproved(`replace ${row.kind} ${row.post_key}`)
      const chat = isIslamicKind(row.kind) ? islamicChannel(approval) : communityChannel(approval)
      let ok = true
      if (row.telegram_message_id) ok = Boolean(chat) && (await tg("deleteMessage", { chat_id: chat, message_id: row.telegram_message_id })).ok
      if (row.facebook_post_id && facebookConfig()) ok = (await deleteFacebookPost(approval, row.facebook_post_id)) && ok
      return ok
    },
    async replaceDone(id, ok, ids, hash, removed) {
      await botDb().rpc("bot_post_replace_done", { p_key: botKey(), p_id: id, p_ok: ok, p_telegram: ids.telegram, p_facebook: ids.facebook, p_hash: hash, p_old_removed: removed })
    },
    async notify(text) {
      let sent = 0
      for (const chat of await founderChats()) if ((await tg("sendMessage", { chat_id: chat, text, disable_web_page_preview: true })).ok) sent++
      logEvent("info", "scheduled-posts", `Replacement note sent to ${sent} chat(s)`)
    },
  }
  const remind = {
    async claim(id: number, level: number) {
      const { data } = await botDb().rpc("bot_post_remind_claim", { p_key: botKey(), p_id: id, p_level: level })
      return data === true
    },
    // The founder's private chat only — never «LCA Approval» (the group already has the card).
    founderChats: () => founderChats(),
  }
  return { ...base, replace, remind }
}

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

/** One Islamic post's content (poster and caption), with the admin's Hijri offset. */
async function islamicContent(kind: IslamicKind, day: string) {
  const offset = await hijriOffset()
  const tomorrow = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  return islamicPostContent(kind, day, toHijri(dateOf(day), offset), toHijri(dateOf(tomorrow), offset))
}

let scheduler: ReturnType<typeof createScheduler> | null = null
const real = () => (scheduler ??= createScheduler(withReplace(realDeps())))

/** Called every minute by the dispatcher. */
export async function scheduledPostsTick() {
  const now = phnomPenhToday()
  const offset = await hijriOffset()
  await real().tick(now.day, now.hour * 60 + now.minute, (d) => toHijri(dateOf(d), offset))
  // National days and royal ceremonies (founder, 20/10/2026): previewed from 48 hours before at 08:00, published at
  // 07:00 on the day once approved (a missed preview window is caught up until then — idempotent).
  for (const { day, date } of nationalDaysToPreview(now.day, now.hour * 60 + now.minute))
    await real().schedulePost("NATIONAL_DAY", `${day.key}-${date}`, { key: day.key, day: date }, atMinute(date, PUBLISH_MINUTE))
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

/** The Islamic market bulletin as it would go out now: the Hijri day with the admin's offset, the live rates and gold. */
async function islamicBulletinNow(): Promise<string | null> {
  const now = phnomPenhToday()
  const offset = await hijriOffset()
  const hijri = toHijri(dateOf(now.day), offset)
  return islamicBulletinText(hijri ? formatHijri(hijri, "km") : "", kmDay(now.day))
}
