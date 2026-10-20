/**
 * The standard post footer (founder, 20/10/2026 — the Charge+ Cambodia format: a relatable hook, then one clean block of
 * ways to use the app, the community and the brand's hashtags). Pure (post-footer.test.ts).
 *
 *   community — @LuyChlatCommunity and the Facebook Page: the community and #LuyChlat #អេបលុយឆ្លាត #គ្រប់គ្រងហិរញ្ញវត្ថុ
 *   islamic   — @LuyChlatIslamic only: the Islamic channel and Islamic hashtags; never the general community (strict
 *               religious separation, CLAUDE.md)
 *
 * On Telegram the handles are tappable as «@…»; on Facebook they are written as t.me links (a «@» is not a link there).
 * Not on royal or national commemorations, Sil days or the automatic market feeds (their dignity / their brevity).
 */
export type FooterChannel = "community" | "islamic"
export type FooterPlatform = "telegram" | "facebook"

export function postFooter(channel: FooterChannel, platform: FooterPlatform = "telegram"): string {
  const tg = (handle: string) => (platform === "telegram" ? `@${handle}` : `t.me/${handle}`)
  return [
    "📲 ប្រើប្រាស់ អេប លុយឆ្លាត ដោយឥតគិតថ្លៃ៖",
    "👉 Android (APK) ៖ app.luychlat.com/LuyChlat.apk",
    "👉 iPhone / Web ៖ app.luychlat.com",
    `👉 Telegram Bot ៖ ${tg("luychlat_bot")}`,
    "",
    channel === "islamic" ? `👉 ឆាណែលឥស្លាម ៖ ${tg("LuyChlatIslamic")}` : `👉 ចូលរួមសហគមន៍ ៖ ${tg("LuyChlatCommunity")}`,
    channel === "islamic" ? "#LuyChlatIslamic #អេបលុយឆ្លាត #ហិរញ្ញវត្ថុហាឡាល់" : "#LuyChlat #អេបលុយឆ្លាត #គ្រប់គ្រងហិរញ្ញវត្ថុ",
  ].join("\n")
}

/** Telegram's photo caption limit (a text message allows 4096). */
export const PHOTO_CAPTION_LIMIT = 1024

/** The caption with the footer below it — or the caption alone when both would not fit (the post is never cut). */
export function withFooter(caption: string, footer: string, limit = PHOTO_CAPTION_LIMIT): string {
  const joined = `${caption.trimEnd()}\n\n${footer}`
  return joined.length <= limit ? joined : caption
}
