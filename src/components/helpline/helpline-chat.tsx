"use client"

import { HeadsetIcon, Loader2Icon, MessageCircleQuestionIcon, SendIcon, SparklesIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { useFeatures } from "@/lib/features"
import { bestAnswer, KNOWLEDGE, QUICK_IDS, staffHours, wantsHuman, type HelpEntry } from "@/lib/helpline/knowledge"
import { useLocaleStore } from "@/stores/locale-store"
import { useUpgradeStore } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

type Msg = { from: "me" | "bot"; text: string; entry?: HelpEntry; offerHuman?: boolean; chips?: string[] }

const T = {
  title: { km: "ជំនួយ អេប លុយឆ្លាត", en: "App Luy Chlat help" },
  hello: { km: "សួស្តី! ខ្ញុំអាចជួយអ្វីបាន? ជ្រើសសំណួរខាងក្រោម ឬសរសេរសំណួររបស់អ្នក។", en: "Hi! How can I help? Pick a question below or type your own." },
  placeholder: { km: "សរសេរសំណួរ…", en: "Type a question…" },
  unknown: { km: "ខ្ញុំមិនទាន់មានចម្លើយច្បាស់សម្រាប់សំណួរនេះទេ។ ចង់ផ្ញើទៅក្រុមការងារឱ្យឆ្លើយទេ?", en: "I don't have a clear answer to that yet. Send it to our team?" },
  human: { km: "និយាយជាមួយក្រុមការងារ", en: "Talk to our team" },
  upgrade: { km: "ជាវឥឡូវ", en: "Upgrade now" },
  more: { km: "សំណួរផ្សេងទៀត", en: "Other questions" },
  sentOpen: { km: "បានផ្ញើទៅក្រុមការងារហើយ — យើងនឹងឆ្លើយឆាប់ៗ តាម Telegram និងទំព័រ «ជំនួយ»។", en: "Sent to our team — we'll reply soon on Telegram and the Help page." },
  sentClosed: { km: "បានផ្ញើហើយ។ ក្រុមការងារឆ្លើយ ចន្ទ–សុក្រ ម៉ោង 08:00–17:00 — អាចត្រូវរង់ចាំបន្តិច។ ចម្លើយនឹងមកតាម Telegram និងទំព័រ «ជំនួយ»។", en: "Sent. Our team replies Monday–Friday, 08:00–17:00, so it may take a little while. The reply comes on Telegram and the Help page." },
  failed: { km: "ផ្ញើមិនបានទេ — សូមព្យាយាមម្តងទៀត ឬចូលទំព័រ «ជំនួយ»។", en: "Couldn't send — please try again or open the Help page." },
}

/**
 * The helpline chat (founder, 4/11/2026 — like Cellcard / AirAsia): a button at the bottom of every screen; quick questions
 * and typed ones answered at once from the approved knowledge only (lib/helpline/knowledge.ts — never a guess, never the
 * person's numbers); the plan answers carry «ជាវឥឡូវ» (the upgrade sheet); what it can't answer goes to the team as a
 * support ticket (Telegram both ways), with the working hours said when it's outside them. Phase 1: in the app.
 */
export function HelplineChat() {
  const locale = useLocaleStore((s) => s.locale)
  const L = (b: { km: string; en: string }) => (locale === "km" ? b.km : b.en)
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>(() => [{ from: "bot", text: "", chips: QUICK_IDS }])
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const allowed = useFeatures().allowed("helpline")

  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs, open])
  // Never over the pages that are a conversation themselves.
  if (!allowed || pathname.startsWith("/support") || pathname.startsWith("/advisor")) return null

  const answer = (entry: HelpEntry, asked: string) => setMsgs((m) => [...m, { from: "me", text: asked }, { from: "bot", text: "", entry }])
  const ask = (raw: string) => {
    const q = raw.trim()
    if (!q) return
    setText("")
    if (wantsHuman(q)) return setMsgs((m) => [...m, { from: "me", text: q }, { from: "bot", text: L(T.unknown), offerHuman: true }])
    const hit = bestAnswer(q)
    if (hit) return answer(hit, q)
    setMsgs((m) => [...m, { from: "me", text: q }, { from: "bot", text: L(T.unknown), offerHuman: true }])
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
        <div role="dialog" aria-label={L(T.title)} className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[78dvh] max-w-md flex-col rounded-t-3xl border bg-background shadow-2xl md:right-6 md:bottom-6 md:left-auto md:h-[70vh] md:w-96 md:rounded-3xl">
          <header className="flex items-center gap-2 border-b px-4 py-3">
            <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
              <HeadsetIcon className="size-5" />
            </span>
            <span className="flex-1 font-semibold">{L(T.title)}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label={locale === "km" ? "បិទ" : "Close"} className="grid size-10 place-items-center rounded-full hover:bg-muted">
              <XIcon className="size-5" />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.map((m, i) =>
              m.from === "me" ? (
                <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {m.text}
                </p>
              ) : (
                <div key={i} className="max-w-[92%] space-y-2">
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
                          <button key={id} type="button" onClick={() => answer(e, L(e.q))} className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
                            {L(e.q)}
                          </button>
                        ) : null
                      })}
                    </div>
                  )}
                </div>
              ),
            )}
            <div ref={end} />
          </div>
          <form
            className={cn("flex items-center gap-2 border-t px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]")}
            onSubmit={(e) => {
              e.preventDefault()
              ask(text)
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={L(T.placeholder)} className="h-11 min-w-0 flex-1 rounded-full border bg-background px-4 text-base" />
            <Button type="submit" size="icon" className="size-11 rounded-full" aria-label="Send" disabled={!text.trim()}>
              <SendIcon />
            </Button>
          </form>
        </div>
      )}
    </>
  )
}
