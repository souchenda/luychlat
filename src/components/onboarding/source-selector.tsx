"use client"

import { Loader2Icon } from "lucide-react"
import { create } from "zustand"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useT } from "@/lib/i18n/use-t"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { ACQUISITION_SOURCES, shouldAskSource, type AcquisitionSource } from "@/lib/acquisition"
import { useProfilePrivate, useSaveAcquisitionSource } from "@/lib/profile-private"
import { cn } from "@/lib/utils"
import { useSessionStore } from "@/stores/session-store"

/** «រំលង» hides it for this visit only — it comes back next time until answered. */
const useSkipped = create<{ skipped: boolean; skip: () => void }>((set) => ({ skipped: false, skip: () => set({ skipped: true }) }))

const OPTIONS: Record<AcquisitionSource, { emoji: string; tile: string }> = {
  facebook: { emoji: "🔵", tile: "bg-blue-500/10" },
  telegram: { emoji: "✈️", tile: "bg-sky-500/10" },
  referral: { emoji: "👥", tile: "bg-amber-500/15" },
  organic_search: { emoji: "🔍", tile: "bg-emerald-500/10" },
}

/** Whether the first-visit question is showing — the Islamic Mode choice waits for it (one dialog at a time). */
export function useSourcePromptOpen(): boolean {
  const createdAt = useSessionStore((s) => s.user?.created_at ?? null)
  const { data, isSuccess } = useProfilePrivate()
  const skipped = useSkipped((s) => s.skipped)
  return shouldAskSource({ createdAt, now: Date.now(), loaded: isSuccess, answered: Boolean(data?.acquisition_source), skipped })
}

/**
 * First visit: «តើបងបានស្គាល់ «អេប លុយឆ្លាត» តាមរយៈណាដែរ?» — four large one-tap cards; the tap saves
 * the answer and closes (the person is already on Home). «រំលង» never blocks.
 */
export function SourceSelector() {
  const t = useT()
  const open = useSourcePromptOpen()
  const save = useSaveAcquisitionSource()
  const skip = useSkipped((s) => s.skip)

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
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-xl", OPTIONS[s].tile)} aria-hidden>
                  {OPTIONS[s].emoji}
                </span>
                <span className="min-w-0 flex-1 font-semibold">{t(`source.${s}` as MessageKey)}</span>
                {busy && <Loader2Icon className="size-5 shrink-0 animate-spin text-muted-foreground" />}
              </button>
            )
          })}
        </div>
        <button type="button" className="mx-auto px-3 py-1 text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={skip}>
          {t("source.skip")}
        </button>
      </DialogContent>
    </Dialog>
  )
}
