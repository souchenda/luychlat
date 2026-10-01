"use client"

import { BotIcon, Loader2Icon, SendHorizontalIcon, ShieldCheckIcon } from "lucide-react"
import { Fragment, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { answer, detectIntent, type Intent, type Lang } from "@/lib/advisor/engine"
import { toAnonymousPayload } from "@/lib/advisor/payload"
import type { Snapshot, SnapshotLabels } from "@/lib/advisor/snapshot"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { showUpgrade, usePlan, useRefreshPlan } from "@/lib/plan"
import { cn } from "@/lib/utils"
import { effectiveProvider, useAiStore } from "@/stores/ai-store"

type ChatMessage = { role: "user" | "assistant"; content: string; offline?: boolean }

const CHIPS: { intent: Intent; label: MessageKey }[] = [
  { intent: "improve_score", label: "advisor.chip.score" },
  { intent: "debt_first", label: "advisor.chip.debtFirst" },
  { intent: "month_status", label: "advisor.chip.month" },
  { intent: "shortfall", label: "advisor.chip.shortfall" },
  { intent: "save_tips", label: "advisor.chip.save" },
]

/** Renders **bold** and line breaks; everything else is plain text (no HTML injection). */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part,
          )}
        </Fragment>
      ))}
    </>
  )
}

export function AdvisorChat({
  snapshot,
  labels,
  lang,
  request,
}: {
  snapshot: Snapshot
  labels: SnapshotLabels
  lang: Lang
  /** A question asked from elsewhere on the page (e.g. the score card); sent once per id. */
  request?: { id: number; text: string } | null
}) {
  const t = useT()
  const ai = useAiStore()
  const provider = effectiveProvider(ai)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [pending, setPending] = useState(false)
  const [showPayload, setShowPayload] = useState(false)
  const { plan, isPro } = usePlan()
  const refreshPlan = useRefreshPlan()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [messages, pending])

  const ask = async (question: string, intent?: Intent) => {
    const text = question.trim()
    if (!text || pending) return
    const history = messages.filter((m) => !m.offline).map(({ role, content }) => ({ role, content }))
    setMessages((m) => [...m, { role: "user", content: text }])
    setInput("")
    setPending(true)

    const offline = () => answer(intent ?? detectIntent(text), snapshot, labels, lang)
    // LuySmart AI is a Pro feature: without Pro, answer offline and offer the upgrade.
    if (provider === "luysmart" && !isPro) {
      setMessages((m) => [...m, { role: "assistant", content: `${t("advisor.proOnly")}\n\n${offline()}`, offline: true }])
      setPending(false)
      showUpgrade("ai")
      return
    }
    if (provider === "simulated") {
      await new Promise((r) => setTimeout(r, 450)) // feels like a reply, keeps the UI honest about "thinking"
      setMessages((m) => [...m, { role: "assistant", content: offline() }])
      setPending(false)
      return
    }

    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: provider === "anthropic" ? ai.anthropicKey : provider === "openai" ? ai.openaiKey : undefined,
          model: provider === "openai" ? ai.openaiModel : undefined,
          language: lang,
          snapshot: toAnonymousPayload(snapshot),
          history: history.slice(-12),
          question: text,
        }),
      })
      const data = (await res.json()) as { text?: string; error?: string }
      if (provider === "luysmart") void refreshPlan()
      if (!res.ok || !data.text) throw new Error(data.error ?? "provider_error")
      setMessages((m) => [...m, { role: "assistant", content: data.text! }])
    } catch (error) {
      const reason = error instanceof Error ? error.message : "provider_error"
      const note = t(
        reason === "invalid_key"
          ? "advisor.errorKey"
          : reason === "rate_limited"
            ? "advisor.errorRate"
            : reason === "quota_exceeded"
              ? "advisor.errorQuota"
              : reason === "plan_required"
                ? "advisor.proOnly"
                : reason === "ai_unavailable"
                  ? "advisor.errorUnavailable"
                  : "advisor.errorGeneric",
      )
      if (reason === "plan_required") showUpgrade("ai")
      setMessages((m) => [...m, { role: "assistant", content: `${note}\n\n${offline()}`, offline: true }])
    } finally {
      setPending(false)
    }
  }

  const lastRequest = useRef<number | null>(null)
  useEffect(() => {
    if (!request || request.id === lastRequest.current) return
    lastRequest.current = request.id
    void ask(request.text, "improve_score")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per request id
  }, [request?.id])

  const quotaLeft = Math.max(0, plan.ai_queries_per_month - plan.ai_queries_used)

  return (
    <section className="space-y-3">
      {provider === "luysmart" && isPro && (
        <p className="text-xs text-muted-foreground">{t("advisor.quota", { left: quotaLeft, limit: plan.ai_queries_per_month })}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((chip) => (
          <Button
            key={chip.intent}
            type="button"
            size="sm"
            variant="secondary"
            className="h-auto rounded-full py-1.5 text-xs whitespace-normal"
            disabled={pending}
            onClick={() => ask(t(chip.label), chip.intent)}
          >
            {t(chip.label)}
          </Button>
        ))}
      </div>

      {messages.length > 0 && (
        <div className="space-y-2">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  m.role === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted",
                )}
              >
                {m.role === "assistant" && <BotIcon className="mb-1 size-4 text-muted-foreground" aria-hidden />}
                <RichText text={m.content} />
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              {t("advisor.thinking")}
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(input)
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("advisor.placeholder")}
          maxLength={1000}
          className="h-11"
          aria-label={t("advisor.placeholder")}
        />
        <Button type="submit" size="icon" className="size-11 shrink-0" disabled={pending || !input.trim()} aria-label={t("advisor.send")}>
          <SendHorizontalIcon />
        </Button>
      </form>

      {/* Privacy: say exactly what (if anything) leaves the device. */}
      <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
        <p className="flex items-start gap-1.5">
          <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
          {provider === "simulated" ? t("advisor.privacyOffline") : t("advisor.privacyLive")}
        </p>
        {provider !== "simulated" && (
          <>
            <button type="button" className="mt-1 underline" onClick={() => setShowPayload((v) => !v)}>
              {showPayload ? t("advisor.hidePayload") : t("advisor.showPayload")}
            </button>
            {showPayload && (
              <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-background p-2 text-[10px] leading-tight">
                {JSON.stringify(toAnonymousPayload(snapshot), null, 1)}
              </pre>
            )}
          </>
        )}
      </div>
    </section>
  )
}
