"use client"

import { RotateCwIcon } from "lucide-react"
import { useState } from "react"

import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

/**
 * A home widget whose data failed to load: one quiet line in its own place, with a retry — never a
 * global banner over a loaded dashboard, and never a widget that silently disappears (an overdue bill
 * must not just vanish).
 */
export function WidgetRetry({ name, onRetry, className }: { name: string; onRetry: () => unknown; className?: string }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  return (
    <div role="status" className={cn("flex items-center gap-3 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground", className)}>
      <span className="min-w-0 flex-1">{t("widget.loadFailed", { name })}</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onRetry()
          } finally {
            setBusy(false)
          }
        }}
        className="-my-1 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
      >
        <RotateCwIcon className={cn("size-4", busy && "animate-spin")} aria-hidden />
        {t("widget.retry")}
      </button>
    </div>
  )
}
