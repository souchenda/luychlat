"use client"

import { ArchiveIcon, ArchiveRestoreIcon, CrownIcon, LockIcon, TimerIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { Workspace } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { showUpgrade } from "@/lib/plan"
import { useBusinessLifecycle } from "@/lib/profile"
import { cn } from "@/lib/utils"
import { formatDuration } from "@/lib/format"
import { useLocaleStore } from "@/stores/locale-store"

/** Whole days left until `iso` (at least 0). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000))
}

/** Free plan, Business workspace: "Business trial: X days left" (tap to upgrade). Nothing otherwise. */
export function BusinessTrialTag({ workspace, className }: { workspace: Workspace | undefined; className?: string }) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  if (workspace?.type !== "BUSINESS" || !workspace.trial_ends_at || workspace.locked) return null
  const days = daysUntil(workspace.trial_ends_at)
  return (
    <button
      type="button"
      onClick={() => showUpgrade("trial")}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        days <= 14 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-sky-500/10 text-sky-700 dark:text-sky-400",
        className,
      )}
    >
      <TimerIcon className="size-3.5" aria-hidden />
      {t("business.trialLeft", { duration: formatDuration(days, "remaining", locale) })}
    </button>
  )
}

/** Read-only notice for a business the plan no longer covers (all pages). */
export function WorkspaceLockedBanner({ workspace }: { workspace: Workspace | undefined }) {
  const t = useT()
  if (!workspace?.locked) return null
  if (workspace.locked === "ARCHIVED") return <ArchivedBanner workspace={workspace} />
  const trial = workspace.locked === "TRIAL_ENDED"
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
      <LockIcon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{t(trial ? "business.trialEnded" : "business.overLimit")}</span>
      <Button size="sm" className="h-7 shrink-0 rounded-full bg-amber-500 px-3 text-xs text-white hover:bg-amber-600" onClick={() => showUpgrade(trial ? "trial" : "business")}>
        <CrownIcon className="size-3.5" />
        {t("upgrade.cta")}
      </Button>
    </div>
  )
}

/** Archived business: read-only, with a one-tap restore for the owner. */
function ArchivedBanner({ workspace }: { workspace: Workspace }) {
  const t = useT()
  const { setArchived } = useBusinessLifecycle()
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border bg-muted px-3 py-2 text-sm text-muted-foreground">
      <ArchiveIcon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">{t("business.archivedNotice")}</span>
      {workspace.role === "OWNER" && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 rounded-full px-3 text-xs"
          disabled={setArchived.isPending}
          onClick={() =>
            setArchived.mutate(
              { id: workspace.id, archived: false },
              { onSuccess: () => toast.success(t("business.restored")), onError: () => toast.error(t("common.error")) },
            )
          }
        >
          <ArchiveRestoreIcon className="size-3.5" />
          {t("business.restore")}
        </Button>
      )}
    </div>
  )
}
