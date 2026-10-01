"use client"

import { Building2Icon, UserIcon, type LucideIcon } from "lucide-react"

import type { WorkspaceType } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

const OPTIONS: { type: WorkspaceType; icon: LucideIcon }[] = [
  { type: "PERSONAL", icon: UserIcon },
  { type: "BUSINESS", icon: Building2Icon },
]

/** One-tap Personal / Business toggle with a sliding indicator. */
export function WorkspaceSwitcher() {
  const t = useT()
  const active = usePrefsStore((s) => s.activeWorkspace)
  const setActive = usePrefsStore((s) => s.setActiveWorkspace)
  const index = OPTIONS.findIndex((o) => o.type === active)

  return (
    <div role="tablist" aria-label="Workspace" className="relative grid grid-cols-2 rounded-full bg-muted p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-background shadow-sm transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {OPTIONS.map(({ type, icon: Icon }) => (
        <button
          key={type}
          type="button"
          role="tab"
          aria-selected={active === type}
          onClick={() => setActive(type)}
          className={cn(
            "relative z-10 flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium transition-colors",
            active === type ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {t(`ws.${type}`)}
        </button>
      ))}
    </div>
  )
}
