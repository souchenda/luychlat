// Server only: the ONE door to the public community channel and the Facebook Page (founder, 18/10/2026 —
// zero public posts without the founder's approval).
//
// The channel's id is handed out only against a FounderApproval, and the Facebook publish functions take
// one too. An approval is made (founderApproved) only where the founder's decision has been checked:
//   • lib/server/scheduled-posts.ts — a post the founder approved (✅ / 🚀; the database refuses the rest);
//   • lib/server/tip-bot.ts — the 12:00 tip the founder approved («✅ អនុម័តផ្សាយ»);
//   • lib/server/festival-poster.ts — the founder's own 📢 tap on a poster preview.
// tests/golden/publish-approval.test.ts fails the build if any other file reads the channel id from the
// environment or makes an approval.

declare const approved: unique symbol

/** Proof that the founder approved this post — `what` names it in logs. */
export type FounderApproval = { readonly [approved]: true; readonly what: string }

/** Only in the three places above (the golden guard checks). */
export const founderApproved = (what: string): FounderApproval => ({ what }) as FounderApproval

const raw = () => (process.env.TELEGRAM_COMMUNITY_CHAT_ID ?? process.env.TELEGRAM_COMMUNITY_CHANNEL_ID)?.trim() || null

/** The channel to post an APPROVED post to (null when not configured). */
export function communityChannel(approval: FounderApproval): string | null {
  void approval // the proof is the parameter: no approval, no channel
  return raw()
}

/** Is a channel configured at all — for a preview's destination badge (posts nothing). */
export const communityChannelConfigured = (): boolean => Boolean(raw())

/** Is this chat the community channel — the group guard (never leave it), the live update of an approved post. */
export function isCommunityChannel(chat: string | number | null | undefined): boolean {
  const id = raw()
  return Boolean(id) && chat !== null && chat !== undefined && String(chat) === id
}

/**
 * The channel's configured id or @username, to IDENTIFY it only — the group guard (never leave it) and the
 * admin status page. Never used to post (the golden guard allows it in those two files only).
 */
export const communityChannelRef = (): string | null => raw()

// ─── The Islamic community channel (@LuyChlatIslamic, founder, 18/10/2026) ─────────────────────────
// Its own door, behind the same FounderApproval. Only the Islamic posts go here (lib/islamic-channel.ts
// channelFor) — never a Buddhist holy-day note; the general channel never gets an Islamic post.

const islamicRaw = () => process.env.TELEGRAM_ISLAMIC_CHANNEL_ID?.trim() || null

/** The Islamic channel to post an APPROVED Islamic post to (null when not configured). */
export function islamicChannel(approval: FounderApproval): string | null {
  void approval // the proof is the parameter: no approval, no channel
  return islamicRaw()
}

export const islamicChannelConfigured = (): boolean => Boolean(islamicRaw())

/** The Islamic channel's id or @username, to IDENTIFY it only (the group guard never leaves it). */
export const islamicChannelRef = (): string | null => islamicRaw()
