/**
 * The standard post footer (founder, 20/10/2026 — the Charge+ Cambodia format: a relatable hook, then one clean block of
 * ways to use the app, the community and the brand's hashtags). Pure (post-footer.test.ts).
 *
 *   community — @LuyChlatCommunity and the Facebook Page: the community and #LuyChlat #អេបលុយឆ្លាត #គ្រប់គ្រងហិរញ្ញវត្ថុ
 *   islamic   — @LuyChlatIslamic only: the Islamic channel and Islamic hashtags; never the general community (strict
 *               religious separation, CLAUDE.md)
 *
 * Compact (founder, 21/10/2026 — «too many lines, long raw URLs»): the three ways to use the app on ONE line of inline
 * links «Android (APK) || iOS / Web || Telegram Bot». On Telegram the posts are HTML, so the links are <a href> (the
 * founder's [text](url) as Telegram renders it) and the handles are tappable «@…»; Facebook shows no inline links, so
 * there each name carries its short address and the handles are t.me links (a «@» is not a link there).
 * Not on royal or national commemorations, Sil days or the automatic market feeds (their dignity / their brevity).
 */
export type FooterChannel = "community" | "islamic"
export type FooterPlatform = "telegram" | "facebook"

/** The three ways to use the app, in the founder's order. */
export const APP_LINKS = [
  { label: "Android (APK)", url: "https://app.luychlat.com/LuyChlat.apk" },
  { label: "iOS / Web", url: "https://app.luychlat.com" },
  { label: "Telegram Bot", url: "https://t.me/luychlat_bot" },
] as const

/** The brand's hashtags — the Khmer one is «#អេបលុយឆ្លាត» (with ប), never «#អេរលុយឆ្លាត». */
export const HASHTAGS: Record<FooterChannel, string> = {
  community: "#LuyChlat #អេបលុយឆ្លាត #គ្រប់គ្រងហិរញ្ញវត្ថុ",
  islamic: "#LuyChlatIslamic #អេបលុយឆ្លាត #ហិរញ្ញវត្ថុហាឡាល់",
}

/** «Android (APK) || iOS / Web || Telegram Bot» — inline links on Telegram (HTML), names with short addresses on Facebook. */
export function appLinksLine(platform: FooterPlatform = "telegram"): string {
  return APP_LINKS.map((l) => (platform === "telegram" ? `<a href="${l.url}">${l.label}</a>` : `${l.label}: ${l.url.replace(/^https:\/\//, "")}`)).join(" || ")
}

/** The footer — Telegram's is HTML: send it with parse_mode HTML and escape only the post's own words. */
export function postFooter(channel: FooterChannel, platform: FooterPlatform = "telegram"): string {
  const tg = (handle: string) => (platform === "telegram" ? `@${handle}` : `t.me/${handle}`)
  return [
    "📲 ប្រើប្រាស់ អេប លុយឆ្លាត ដោយឥតគិតថ្លៃ៖",
    appLinksLine(platform),
    "",
    channel === "islamic" ? `👉 ឆាណែលឥស្លាម ៖ ${tg("LuyChlatIslamic")}` : `👉 ចូលរួមសហគមន៍ ៖ ${tg("LuyChlatCommunity")}`,
    HASHTAGS[channel],
  ].join("\n")
}

/**
 * The compact one-line footer (founder, 21/10/2026 — the Islamic market bulletin): the channel and the hashtags only,
 * «@LuyChlatIslamic #LuyChlatIslamic #អេបលុយឆ្លាត #ហិរញ្ញវត្ថុហាឡាល់» — for a factual feed that already links the app.
 */
export function compactFooter(channel: FooterChannel): string {
  return `${channel === "islamic" ? "@LuyChlatIslamic" : "@LuyChlatCommunity"} ${HASHTAGS[channel]}`
}

/** Telegram's photo caption limit (a text message allows 4096). */
export const PHOTO_CAPTION_LIMIT = 1024

/** The caption with the footer below it — or the caption alone when both would not fit (the post is never cut). */
export function withFooter(caption: string, footer: string, limit = PHOTO_CAPTION_LIMIT): string {
  const joined = `${caption.trimEnd()}\n\n${footer}`
  return joined.length <= limit ? joined : caption
}
