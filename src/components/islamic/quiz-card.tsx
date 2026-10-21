"use client"

import { CheckCircle2Icon, ExternalLinkIcon, FlameIcon, XCircleIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { todayDate } from "@/lib/debts"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicEnabled } from "@/lib/islamic-settings"
import { answerQuestion, dailyQuizSet, EMPTY_PROGRESS, progressFor, scoreOf, TOPIC_LABEL, type QuizProgress } from "@/lib/islamic-quiz"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/stores/session-store"

const LETTERS = ["ក", "ខ", "គ", "ឃ"]

/** The device keeps the day's answers and the streak, one record per account (a convenience, not a ledger). */
const storageKey = (userId: string | undefined) => `luychlat-islamic-quiz:${userId ?? "anon"}`
function load(userId: string | undefined): QuizProgress | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? ({ ...EMPTY_PROGRESS, ...JSON.parse(raw) } as QuizProgress) : null
  } catch {
    return null
  }
}
function save(userId: string | undefined, p: QuizProgress) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(p))
  } catch {
    // private mode / storage full: the quiz still works for this visit
  }
}

/**
 * «ល្បងប្រាជ្ញាច្បាប់សាសនា (Islamic Quiz Challenge)» on /islamic (founder, 18/10/2026): five questions a day, one at
 * a time; tap an answer → green if right (red on a wrong pick, the right one green), the explanation and its source;
 * the day's score and the streak of days played. /islamic?tab=quiz scrolls here (the quiz is in the app only).
 * Only for Islamic Mode users: hidden otherwise, and /islamic itself shows the locked notice (layout.tsx).
 */
export function IslamicQuizCard() {
  const t = useT()
  const num = (n: number) => String(n)
  const userId = useSessionStore((s) => s.user?.id)
  const [today, setToday] = useState<string | null>(null)
  const [progress, setProgress] = useState<QuizProgress>(EMPTY_PROGRESS)
  const [index, setIndex] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const day = todayDate()
    const p = progressFor(load(userId), day)
    const set = dailyQuizSet(day)
    setToday(day)
    setProgress(p)
    // Resume at the first unanswered question (or the last one when all are done).
    const next = set.findIndex((q) => p.answers[q.id] === undefined)
    setIndex(next === -1 ? set.length - 1 : next)
    // The channel's button: /islamic?tab=quiz → bring the card into view.
    if (new URLSearchParams(window.location.search).get("tab") === "quiz") ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [userId])

  const set = useMemo(() => (today ? dailyQuizSet(today) : []), [today])
  // Islamic Mode users only (the admin turns it on — founder, 18/10/2026); /islamic's layout also locks the page.
  const islamic = useIslamicEnabled()
  if (!islamic || !today || !set.length) return null

  const q = set[index]
  const chosen = progress.answers[q.id]
  const answered = chosen !== undefined
  const allDone = set.every((x) => progress.answers[x.id] !== undefined)
  const score = scoreOf(progress, set)

  const choose = (option: number) => {
    if (answered) return
    const next = answerQuestion(progress, today, set, q.id, option)
    setProgress(next)
    save(userId, next)
  }

  return (
    <div ref={ref} id="quiz" className="scroll-mt-20">
      <Card className="gap-3 border-emerald-500/30 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">🎮 {t("quiz.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("quiz.subtitle")}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300" aria-label={t("quiz.streak", { n: num(progress.streak) })}>
            <FlameIcon className="size-3.5" aria-hidden />
            {num(progress.streak)}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("quiz.questionOf", { n: num(index + 1), total: num(set.length) })} · {TOPIC_LABEL[q.topic]}</span>
          <span>{t("quiz.score", { score: num(score), total: num(set.length) })}</span>
        </div>
        <div className="flex gap-1" aria-hidden>
          {set.map((x, i) => (
            <span
              key={x.id}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                progress.answers[x.id] === undefined ? (i === index ? "bg-emerald-500/40" : "bg-muted") : progress.answers[x.id] === x.correct ? "bg-emerald-500" : "bg-rose-500",
              )}
            />
          ))}
        </div>

        <p className="text-[15px] leading-relaxed font-medium">{q.question}</p>
        <div className="grid gap-2" role="group" aria-label={q.question}>
          {q.options.map((o, i) => {
            const right = answered && i === q.correct
            const wrong = answered && i === chosen && i !== q.correct
            return (
              <button
                key={i}
                type="button"
                disabled={answered}
                onClick={() => choose(i)}
                aria-pressed={chosen === i}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                  !answered && "hover:border-emerald-500 hover:bg-emerald-500/5 active:scale-[0.99]",
                  right && "border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100",
                  wrong && "border-rose-500 bg-rose-500/10 text-rose-900 dark:text-rose-100",
                  answered && !right && !wrong && "opacity-60",
                )}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{LETTERS[i]}</span>
                <span className="min-w-0 flex-1">{o}</span>
                {right && <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600" aria-hidden />}
                {wrong && <XCircleIcon className="size-5 shrink-0 text-rose-600" aria-hidden />}
              </button>
            )
          })}
        </div>

        {answered && (
          <div className={cn("rounded-xl px-3 py-2.5 text-sm", chosen === q.correct ? "bg-emerald-500/10" : "bg-rose-500/10")} role="status">
            <p className="font-semibold">{chosen === q.correct ? t("quiz.right") : t("quiz.wrong")}</p>
            <p className="mt-1 leading-relaxed">{q.explanation}</p>
            <a href={q.source.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-300">
              {q.source.label}
              <ExternalLinkIcon className="size-3" aria-hidden />
            </a>
          </div>
        )}

        {answered && index < set.length - 1 && (
          <Button type="button" className="h-11 w-full" onClick={() => setIndex(index + 1)}>
            {t("quiz.next")}
          </Button>
        )}
        {allDone && index === set.length - 1 && (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2.5 text-center text-sm font-medium">
            {t("quiz.done", { score: num(score), total: num(set.length), streak: num(progress.streak) })}
          </p>
        )}
      </Card>
    </div>
  )
}
