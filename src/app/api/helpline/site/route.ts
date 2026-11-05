import { NextResponse } from "next/server"

import { staffHours } from "@/lib/helpline/knowledge"
import { siteContact, siteLang, siteQuestion, siteQuick, siteReply } from "@/lib/helpline/site"
import { founderChats } from "@/lib/server/admin-routes"
import { logEvent } from "@/lib/server/events"
import { clientIp, rateLimit, readJson } from "@/lib/server/guard"
import { botDb, botKey, tg } from "@/lib/server/telegram-bot"

/**
 * The helpline on luychlat.com (founder, 5/11/2026 — Website/helpline.js): no sign-in. GET: is it open (the «helpline»
 * flag, or the team's own test) and the quick questions; POST {text}: the reply, from the approved knowledge only
 * (lib/helpline/site.ts); POST {send, contact}: the question to the founder's private Telegram with the visitor's phone or
 * Telegram username — he answers them himself. Only luychlat.com may call it (CORS), and every visitor is rate-limited.
 */
export const runtime = "nodejs"

const SITE = "https://luychlat.com"

function cors(request: Request): Record<string, string> | null {
  const origin = request.headers.get("origin")
  if (origin !== null && origin !== SITE) return null
  return { "Access-Control-Allow-Origin": SITE, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", Vary: "Origin" }
}

const json = (h: Record<string, string>, body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...h, "Cache-Control": "no-store" } })

function limited(request: Request, name: string, limit: number, windowMs: number) {
  return !rateLimit(`helpline-site-${name}:${clientIp(request)}`, limit, windowMs).ok
}

export function OPTIONS(request: Request) {
  const h = cors(request)
  return h ? new NextResponse(null, { status: 204, headers: h }) : new NextResponse(null, { status: 403 })
}

export async function GET(request: Request) {
  const h = cors(request)
  if (!h) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 })
  if (limited(request, "get", 60, 60_000)) return json(h, { error: "rate_limited" }, 429)
  const url = new URL(request.url)
  const lang = siteLang(url.searchParams.get("lang"))
  const { data, error } = await botDb().rpc("bot_helpline_site_on", { p_key: botKey() })
  const open = !error && data === true
  // The team tries it before it is public: luychlat.com/?helpline=test (it answers from the same approved knowledge).
  const test = url.searchParams.get("test") === "1"
  if (!open && !test) return json(h, { open: false })
  return json(h, { open: true, staffNow: staffHours(Date.now()), quick: siteQuick(lang) })
}

type Body = { text?: unknown; lang?: unknown; send?: unknown; contact?: unknown }

export async function POST(request: Request) {
  const h = cors(request)
  if (!h) return NextResponse.json({ error: "forbidden_origin" }, { status: 403 })
  const body = (await readJson(request, 4_000)) as Body | null
  if (!body) return json(h, { error: "invalid" }, 400)
  const lang = siteLang(body.lang)

  if (body.send !== true) {
    if (limited(request, "ask", 30, 60_000)) return json(h, { error: "rate_limited" }, 429)
    const text = siteQuestion(body.text)
    if (!text) return json(h, { error: "invalid" }, 400)
    return json(h, siteReply(text, lang))
  }

  // To the team: a few a day per visitor at most — the founder's Telegram is not a target.
  if (limited(request, "send", 5, 24 * 3_600_000)) return json(h, { error: "rate_limited" }, 429)
  const question = siteQuestion(body.text)
  const contact = siteContact(body.contact)
  if (!question) return json(h, { error: "invalid" }, 400)
  if (!contact) return json(h, { error: "contact" }, 400)
  const reach = contact.startsWith("@") ? `Telegram ${contact} (https://t.me/${contact.slice(1)})` : `ទូរសព្ទ ${contact}`
  const text = `💬 សំណួរពីគេហទំព័រ luychlat.com\n\n«${question}»\n\n📞 ទាក់ទងត្រឡប់៖ ${reach}\n🌐 ភាសា៖ ${lang === "km" ? "ខ្មែរ" : "English"}`
  const chats = await founderChats()
  let reached = 0
  // Plain text, and not through sendText: the visitor's own phone number is what bang needs to call back (no masking).
  for (const chatId of chats) if ((await tg("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true })).ok) reached += 1
  logEvent(reached ? "info" : "warn", "helpline", `Website question: the founder told in ${reached} of ${chats.length} chat(s)`, { fold: true })
  if (!reached) return json(h, { error: "unavailable" }, 503)
  return json(h, { status: "sent", staffNow: staffHours(Date.now()) })
}
