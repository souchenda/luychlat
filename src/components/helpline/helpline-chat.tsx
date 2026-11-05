"use client"

import { HeadsetIcon, Loader2Icon, MessageCircleQuestionIcon, SendIcon, SparklesIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { useFeatures } from "@/lib/features"
import { classify, KIND_REPLY, KNOWLEDGE, QUICK_IDS, staffHours, wantsHuman, type HelpEntry } from "@/lib/helpline/knowledge"
import { useLocaleStore } from "@/stores/locale-store"
import { useUpgradeStore } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Msg = { from: "me" | "bot"; text: string; entry?: HelpEntry; offerHuman?: boolean; chips?: string[] }

const T = {
  title: { km: "ក្រុមការងារ អេប លុយឆ្លាត", en: "App Luy Chlat team" },
  statusOpen: { km: "កំពុងបម្រើ · ចន្ទ–សុក្រ 08:00–17:00", en: "Here now · Mon–Fri 08:00–17:00" },
  statusClosed: { km: "ឆ្លើយភ្លាមៗ · មនុស្សឆ្លើយ ចន្ទ–សុក្រ", en: "Quick answers · people Mon–Fri" },
  hello: { km: "ជម្រាបសួរ! ក្រុមការងារ អេប លុយឆ្លាត រីករាយបម្រើ។ សូមជ្រើសសំណួរខាងក្រោម ឬសរសេរចម្ងល់របស់លោកអ្នក។", en: "Hello! The App Luy Chlat team is glad to help. Pick a question below or type your own." },
  placeholder: { km: "សរសេរចម្ងល់របស់លោកអ្នក…", en: "Type your question…" },
  unknown: { km: "សំណួរនេះ យើងសូមផ្ញើទៅក្រុមការងារ ដើម្បីឆ្លើយលោកអ្នកឱ្យបានច្បាស់លាស់ — ចុចខាងក្រោម។", en: "We'd like our team to answer this one properly. Tap below to send it." },
  toHuman: { km: "បាទ/ចាស ក្រុមការងាររបស់យើងរីករាយនិយាយជាមួយលោកអ្នក — ចុចខាងក្រោម ដើម្បីផ្ញើចម្ងល់។", en: "Of course, our team would be glad to talk with you. Tap below to send your question." },
  human: { km: "និយាយជាមួយក្រុមការងារ", en: "Talk to our team" },
  upgrade: { km: "ជាវឥឡូវ", en: "Upgrade now" },
  sentOpen: { km: "បានផ្ញើទៅក្រុមការងារហើយ — យើងនឹងឆ្លើយឆាប់ៗ តាម Telegram និងទំព័រ «ជំនួយ»។", en: "Sent to our team — we'll reply soon on Telegram and the Help page." },
  sentClosed: { km: "បានផ្ញើហើយ។ ក្រុមការងារឆ្លើយ ចន្ទ–សុក្រ ម៉ោង 08:00–17:00 — អាចត្រូវរង់ចាំបន្តិច។ ចម្លើយនឹងមកតាម Telegram និងទំព័រ «ជំនួយ»។", en: "Sent. Our team replies Monday–Friday, 08:00–17:00, so it may take a little while. The reply comes on Telegram and the Help page." },
  failed: { km: "ផ្ញើមិនបានទេ — សូមព្យាយាមម្តងទៀត ឬចូលទំព័រ «ជំនួយ»។", en: "Couldn't send — please try again or open the Help page." },
  typing: { km: "កំពុងសរសេរ…", en: "Typing…" },
}

/** A reply comes after a short «typing…», like a person answering — longer answers take a little longer (founder, 5/11/2026). */
const typingMs = (m: Msg) => Math.min(1400, 550 + ((m.entry ? m.entry.a.join(" ").length : m.text.length) / 400) * 400)

/** The team's face: the App Luy Chlat logo with a green dot while people are answering. */
function TeamAvatar({ size, online }: { size: "sm" | "md"; online?: boolean }) {
  return (
    <span className={cn("relative shrink-0", size === "md" ? "size-10" : "size-7")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" className="size-full rounded-full border bg-background object-cover" />
      {online !== undefined && (
        <span className={cn("absolute right-0 bottom-0 size-3 rounded-full border-2 border-background", online ? "bg-emerald-500" : "bg-amber-400")} />
      )}
    </span>
  )
}

/**
 * The helpline chat (founder, 4/11/2026 — like Cellcard / AirAsia): a button at the bottom of every screen; quick questions
 * and typed ones answered at once from the approved knowledge only (lib/helpline/knowledge.ts — never a guess, never the
 * person's numbers); the plan answers carry «ជាវឥឡូវ» (the upgrade sheet); what it can't answer goes to the team as a
 * support ticket (Telegram both ways), with the working hours said when it's outside them. A compact card with the team's
 * face, its hours and a «typing…» before each reply (founder, 5/11/2026 — «too wide; it should feel like a team at work»).
 */
export function HelplineChat() {
  const locale = useLocaleStore((s) => s.locale)
  const L = (b: { km: string; en: string }) => (locale === "km" ? b.km : b.en)
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ from: "bot", text: "", chips: QUICK_IDS }])
  const [text, setText] = useState("")
  const [typing, setTyping] = useState(false)
  const [sending, setSending] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const end = useRef<HTMLDivElement>(null)
  const allowed = useFeatures().allowed("helpline")

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs, open, typing])
  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [open])
  // Never over the pages that are a conversation themselves.
  if (!allowed || pathname.startsWith("/support") || pathname.startsWith("/advisor")) return null

  const online = staffHours(now)
  /** The question at once; the reply after a short «typing…». */
  const say = (asked: string, reply: Msg) => {
    setMsgs((m) => [...m, { from: "me", text: asked }])
    setTyping(true)
    window.setTimeout(() => {
      setTyping(false)
      setMsgs((m) => [...m, reply])
    }, typingMs(reply))
  }
  const answer = (entry: HelpEntry, asked: string) => say(asked, { from: "bot", text: "", entry })
  const ask = (raw: string) => {
    const q = raw.trim()
    if (!q || typing) return
    setText("")
    if (wantsHuman(q)) return say(q, { from: "bot", text: L(T.toHuman), offerHuman: true })
    // On the subject or not (founder, 4/11/2026): an approved answer; a courteous word for a greeting, thanks, investment
    // advice or anything off the subject (never sent to the team); only an on-topic question without an answer goes to a person.
    const c = classify(q)
    if (c.kind === "answer" && c.entry) return answer(c.entry, q)
    if (c.kind === "ontopic") return say(q, { from: "bot", text: L(T.unknown), offerHuman: true })
    say(q, { from: "bot", text: L(KIND_REPLY[c.kind as keyof typeof KIND_REPLY]), chips: QUICK_IDS.slice(0, 4) })
  }

  const toTeam = async () => {
    const question = [...msgs].reverse().find((m) => m.from === "me")?.text ?? ""
    setSending(true)
    const { error } = (await getSupabaseBrowserClient()?.rpc("submit_support_ticket", {
      p_category: "OTHER",
      p_message: `[Helpline] ${question}`.slice(0, 2000).padEnd(5, "."),
      p_contact: null,
      p_context: { from: pathname, locale, via: "helpline-chat" },
    })) ?? { error: new Error("offline") }
    setSending(false)
    setMsgs((m) => [...m, { from: "bot", text: error ? L(T.failed) : L(staffHours(Date.now()) ? T.sentOpen : T.sentClosed) }])
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={L(T.title)}
          className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-30 grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 md:bottom-6 print:hidden"
        >
          <MessageCircleQuestionIcon className="size-6" />
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label={L(T.title)}
          className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-50 mx-auto flex max-h-[min(72dvh,560px)] max-w-sm flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl md:right-6 md:bottom-6 md:left-auto md:mx-0 md:w-[360px]"
        >
          <header className="flex items-center gap-3 border-b bg-primary/5 px-4 py-3">
            <TeamAvatar size="md" online={online} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{L(T.title)}</span>
              <span className="block truncate text-xs text-muted-foreground">{L(online ? T.statusOpen : T.statusClosed)}</span>
            </span>
            <button type="button" onClick={() => setOpen(false)} aria-label={locale === "km" ? "បិទ" : "Close"} className="grid size-10 place-items-center rounded-full hover:bg-muted">
              <XIcon className="size-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {msgs.map((m, i) =>
              m.from === "me" ? (
                <p key={i} className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {m.text}
                </p>
              ) : (
                <div key={i} className="flex items-end gap-2">
                  <TeamAvatar size="sm" />
                  <div className="min-w-0 max-w-[85%] space-y-2">
                    <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm leading-relaxed">
                      {m.entry ? (
                        <>
                          <p className="mb-1 font-semibold">{L(m.entry.q)}</p>
                          {m.entry.a.map((p, j) => (
                            <p key={j} className="mt-1">{L(p)}</p>
                          ))}
                        </>
                      ) : (
                        m.text || L(T.hello)
                      )}
                    </div>
                    {m.entry?.action === "upgrade" && (
                      <Button type="button" size="sm" onClick={() => useUpgradeStore.getState().show("general")}>
                        <SparklesIcon /> {L(T.upgrade)}
                      </Button>
                    )}
                    {m.entry?.action && typeof m.entry.action === "object" && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={m.entry.action.href} onClick={() => setOpen(false)}>{L(m.entry.action.label)}</Link>
                      </Button>
                    )}
                    {m.offerHuman && (
                      <Button type="button" size="sm" variant="outline" disabled={sending} onClick={() => void toTeam()}>
                        {sending ? <Loader2Icon className="animate-spin" /> : <HeadsetIcon />} {L(T.human)}
                      </Button>
                    )}
                    {(m.chips ?? (m.entry ? QUICK_IDS.filter((id) => id !== m.entry!.id).slice(0, 3) : [])).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(m.chips ?? QUICK_IDS.filter((id) => id !== m.entry!.id).slice(0, 3)).map((id) => {
                          const e = KNOWLEDGE.find((k) => k.id === id)
                          return e ? (
                            <button key={id} type="button" disabled={typing} onClick={() => answer(e, L(e.q))} className="rounded-full border bg-background px-3 py-1.5 text-left text-xs font-medium hover:bg-muted">
                              {L(e.q)}
                            </button>
                          ) : null
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {typing && (
              <div className="flex items-end gap-2" aria-live="polite">
                <TeamAvatar size="sm" />
                <span className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-3 py-3" aria-label={L(T.typing)}>
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </span>
              </div>
            )}
            <div ref={end} />
          </div>
          <form
            className="flex items-center gap-2 border-t px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:pb-2"
            onSubmit={(e) => {
              e.preventDefault()
              ask(text)
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={L(T.placeholder)} className="h-11 min-w-0 flex-1 rounded-full border bg-background px-4 text-base" />
            <Button type="submit" size="icon" className="size-11 rounded-full" aria-label="Send" disabled={!text.trim() || typing}>
              <SendIcon />
            </Button>
          </form>
        </div>
      )}
    </>
  )
}
