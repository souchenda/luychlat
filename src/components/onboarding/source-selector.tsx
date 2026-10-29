"use client"

import { GlobeIcon, Loader2Icon, SearchIcon, SendIcon, ThumbsUpIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { useState } from "react"
import { create } from "zustand"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useT } from "@/lib/i18n/use-t"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { ACQUISITION_SOURCES, OTHER_SOURCE_MAX, otherSource, shouldAskSource, type AcquisitionAnswer, type AcquisitionSource } from "@/lib/acquisition"
import { useProfilePrivate, useSaveAcquisitionSource } from "@/lib/profile-private"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/stores/session-store"

/** «រំលង» hides it for this visit only — it comes back next time until answered. */
const useSkipped = create<{ skipped: boolean; skip: () => void }>((set) => ({ skipped: false, skip: () => set({ skipped: true }) }))

const OPTIONS: Record<AcquisitionSource, { Icon: LucideIcon; tile: string }> = {
  facebook: { Icon: ThumbsUpIcon, tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  telegram: { Icon: SendIcon, tile: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  referral: { Icon: UsersIcon, tile: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  organic_search: { Icon: SearchIcon, tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
}

/** Whether the first-visit question is showing — the Islamic Mode choice waits for it (one dialog at a time). */
export function useSourcePromptOpen(): boolean {
  const createdAt = useSessionStore((s) => s.user?.created_at ?? null)
  const { data, isSuccess } = useProfilePrivate()
  const skipped = useSkipped((s) => s.skipped)
  return shouldAskSource({ createdAt, now: Date.now(), loaded: isSuccess, answered: Boolean(data?.acquisition_source), skipped })
}

/**
 * First visit: «តើបងបានស្គាល់ «អេប លុយឆ្លាត» តាមរយៈណាដែរ?» — four large one-tap cards (a tap saves the
 * answer and closes; the person is already on Home), and «🌐 ផ្សេងៗ», which opens a field to type the
 * source (TikTok, YouTube, a poster…) with «រក្សាទុក». «រំលង» never blocks.
 */
export function SourceSelector() {
  const t = useT()
  const open = useSourcePromptOpen()
  const save = useSaveAcquisitionSource()
  const skip = useSkipped((s) => s.skip)
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherText, setOtherText] = useState("")
  const other = otherSource(otherText)
  const saveOther = () => other && save.mutate(other as AcquisitionAnswer, { onError: () => skip() })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && skip()}>
      <DialogContent showCloseButton={false} className="gap-4 rounded-3xl p-5">
        <div className="space-y-1 text-center">
          <DialogTitle className="text-lg leading-snug">{t("source.title")}</DialogTitle>
          <DialogDescription>{t("source.subtitle")}</DialogDescription>
        </div>
        <div className="grid gap-2.5">
          {ACQUISITION_SOURCES.map((s) => {
            const busy = save.isPending && save.variables === s
            return (
              <button
                key={s}
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate(s, { onError: () => skip() })}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 border-border px-4 py-3 text-left transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.99] disabled:opacity-70"
              >
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", OPTIONS[s].tile)} aria-hidden>
                  {(() => {
                    const Icon = OPTIONS[s].Icon
                    return <Icon className="size-5" />
                  })()}
                </span>
                <span className="min-w-0 flex-1 font-semibold">{t(`source.${s}` as MessageKey)}</span>
                {busy && <Loader2Icon className="size-5 shrink-0 animate-spin text-muted-foreground" />}
              </button>
            )
          })}
          {/* 🌐 ផ្សេងៗ: a field opens below to type where they heard of us. */}
          <div className={cn("rounded-2xl border-2 transition-colors", otherOpen ? "border-primary bg-primary/5" : "border-border")}>
            <button
              type="button"
              disabled={save.isPending}
              aria-expanded={otherOpen}
              onClick={() => setOtherOpen((v) => !v)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-all active:scale-[0.99] disabled:opacity-70"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400" aria-hidden>
                <GlobeIcon className="size-5" />
              </span>
              <span className="min-w-0 flex-1 font-semibold">{t("source.other")}</span>
            </button>
            <div className={cn("grid transition-all duration-300 ease-out", otherOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
              <form
                className="flex min-h-0 gap-2 overflow-hidden px-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  saveOther()
                }}
              >
                <Input
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  maxLength={OTHER_SOURCE_MAX + 10}
                  placeholder={t("source.otherPlaceholder")}
                  aria-label={t("source.other")}
                  className="mb-3 h-11 min-w-0 flex-1 bg-background"
                  tabIndex={otherOpen ? 0 : -1}
                  autoFocus={otherOpen}
                />
                <Button type="submit" className="mb-3 h-11 shrink-0" disabled={!other || save.isPending} tabIndex={otherOpen ? 0 : -1}>
                  {save.isPending && save.variables === other ? <Loader2Icon className="animate-spin" /> : null}
                  {t("source.otherSave")}
                </Button>
              </form>
            </div>
          </div>
        </div>
        <button type="button" className="mx-auto px-3 py-1 text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={skip}>
          {t("source.skip")}
        </button>
      </DialogContent>
    </Dialog>
  )
}
