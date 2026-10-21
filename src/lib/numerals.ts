/**
 * International numerals everywhere the app speaks (founder, 21/10/2026 — Task #440, «eliminate reading fatigue», like
 * ABA / Wing): channel posts, posters and the bot's messages show 0-9 — «04:23», «5,050 ៛», «21 តុលា 2026»,
 * «Tirmidhi 747» — exactly as the app's screens do (rule 7). One rule, enforced where text leaves the app rather than in
 * every builder: the Telegram calls (lib/server/telegram-bot.ts `tg`, and each photo / audio upload), the Facebook
 * publisher, and every poster's canvas (`latinCanvas`).
 *
 * The single exception: the official royal and national commemorations (Coronation Day, Independence Day, the
 * Constitution, the national day of remembrance) keep the traditional Khmer numerals, per palace protocol — their poster,
 * caption and approval card run inside `withKhmerDigits` (lib/server/numerals.ts; `royalNumerals` in
 * lib/calendar/cambodia-holidays.ts). Pure.
 */
import { latinDigits } from "@/lib/dates"

/** The Telegram fields that carry text a person reads. */
const TEXT_FIELDS = ["text", "caption", "question", "explanation"] as const

type Button = { text?: unknown } & Record<string, unknown>

const latinButtons = (rows: unknown) =>
  Array.isArray(rows)
    ? rows.map((row) => (Array.isArray(row) ? row.map((b) => (typeof b === "string" ? latinDigits(b) : b && typeof b === "object" && typeof (b as Button).text === "string" ? { ...(b as Button), text: latinDigits((b as Button).text as string) } : b)) : row))
    : rows

/** A keyboard (inline or reply), its button texts in 0-9; callback data and URLs untouched. */
export function latinMarkup(markup: unknown): unknown {
  if (!markup || typeof markup !== "object") return markup
  const m = markup as Record<string, unknown>
  return { ...m, ...("inline_keyboard" in m ? { inline_keyboard: latinButtons(m.inline_keyboard) } : {}), ...("keyboard" in m ? { keyboard: latinButtons(m.keyboard) } : {}) }
}

/**
 * A Telegram call's payload with every readable text in 0-9 — the message, the caption, a poll and its options, the
 * buttons, an edited photo's caption (`media`). The digits change one for one, so HTML and lengths stay as they were.
 */
export function latinPayload<T extends Record<string, unknown>>(payload: T): T {
  const out: Record<string, unknown> = { ...payload }
  for (const f of TEXT_FIELDS) if (typeof out[f] === "string") out[f] = latinDigits(out[f] as string)
  if (Array.isArray(out.options)) out.options = out.options.map((o) => (typeof o === "string" ? latinDigits(o) : o && typeof o === "object" && typeof (o as Button).text === "string" ? { ...(o as Button), text: latinDigits((o as Button).text as string) } : o))
  if (out.reply_markup) out.reply_markup = typeof out.reply_markup === "string" ? latinDigits(out.reply_markup) : latinMarkup(out.reply_markup)
  if (out.media && typeof out.media === "object" && typeof (out.media as Button).caption === "string") out.media = { ...(out.media as Button), caption: latinDigits((out.media as Button).caption as string) }
  return out as T
}

/** A multipart upload (sendPhoto, editMessageMedia, sendAudio …): its caption, keyboard and media JSON in 0-9. */
export function latinForm(form: FormData): FormData {
  for (const key of ["caption", "text", "reply_markup", "media"]) {
    const v = form.get(key)
    if (typeof v === "string") form.set(key, latinDigits(v))
  }
  return form
}

type TextContext = {
  fillText(text: string, x: number, y: number, maxWidth?: number): void
  strokeText(text: string, x: number, y: number, maxWidth?: number): void
  measureText(text: string): unknown
}
const PATCHED = Symbol.for("luychlat.latinCanvas")

/**
 * A poster's canvas that draws 0-9: every fillText / strokeText — and measureText, so wrapping and centring measure what
 * is drawn. Applied once per context; a poster's builders keep their text as it is.
 */
export function latinCanvas<C extends TextContext>(ctx: C): C {
  const tagged = ctx as C & { [PATCHED]?: true }
  if (tagged[PATCHED]) return ctx
  const fill = ctx.fillText.bind(ctx)
  const stroke = ctx.strokeText.bind(ctx)
  const measure = ctx.measureText.bind(ctx)
  ctx.fillText = (text, x, y, maxWidth) => (maxWidth === undefined ? fill(latinDigits(text), x, y) : fill(latinDigits(text), x, y, maxWidth))
  ctx.strokeText = (text, x, y, maxWidth) => (maxWidth === undefined ? stroke(latinDigits(text), x, y) : stroke(latinDigits(text), x, y, maxWidth))
  ctx.measureText = (text) => measure(latinDigits(text))
  tagged[PATCHED] = true
  return ctx
}
