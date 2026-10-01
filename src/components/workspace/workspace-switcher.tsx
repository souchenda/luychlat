"use client"

import { Building2Icon, ChevronDownIcon, UserIcon, UsersIcon, type LucideIcon } from "lucide-react"

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useActiveWorkspace, useWorkspaces } from "@/lib/data/hooks"
import type { WorkspaceType } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

const ICONS: Record<WorkspaceType, LucideIcon> = { PERSONAL: UserIcon, BUSINESS: Building2Icon, FAMILY: UsersIcon }

/**
 * One-tap Personal / Business toggle with a sliding indicator, plus a Family
 * tab once the user has (or joined) a family workspace.
 */
export function WorkspaceSwitcher() {
  const t = useT()
  const setActive = usePrefsStore((s) => s.setActiveWorkspace)
  const { workspace } = useActiveWorkspace()
  const families = (useWorkspaces().data ?? []).filter((w) => w.type === "FAMILY")
  const options: WorkspaceType[] = families.length ? ["PERSONAL", "BUSINESS", "FAMILY"] : ["PERSONAL", "BUSINESS"]
  // The resolved workspace (Family falls back to Personal when it no longer exists).
  const preferred = usePrefsStore((s) => s.activeWorkspace)
  const active = workspace?.type ?? preferred
  const index = Math.max(0, options.indexOf(active))
  const width = `calc(${100 / options.length}% - ${0.5 / options.length}rem)`

  const tab = (type: WorkspaceType, extra?: React.ReactNode) => {
    const Icon = ICONS[type]
    const label = type === "FAMILY" && families.length > 1 && workspace?.type === "FAMILY" ? workspace.name : t(`ws.${type}`)
    return (
      <>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        {extra}
      </>
    )
  }
  const tabClass = (type: WorkspaceType) =>
    cn(
      "relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-full px-1.5 py-2 font-medium transition-colors",
      options.length > 2 ? "text-xs" : "text-sm",
      active === type ? "text-foreground" : "text-muted-foreground",
    )

  return (
    <div
      role="tablist"
      aria-label="Workspace"
      className="relative grid rounded-full bg-muted p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-full bg-background shadow-sm transition-transform duration-300 ease-out"
        style={{ width, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((type) =>
        type === "FAMILY" && families.length > 1 && active === "FAMILY" ? (
          // Several family workspaces: the active Family tab opens a picker.
          <DropdownMenu key={type}>
            <DropdownMenuTrigger asChild>
              <button type="button" role="tab" aria-selected className={tabClass(type)}>
                {tab(type, <ChevronDownIcon className="size-3 shrink-0" aria-hidden />)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {families.map((f) => (
                <DropdownMenuItem key={f.id} onSelect={() => setActive("FAMILY", f.id)}>
                  <UsersIcon />
                  {f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={active === type}
            onClick={() => setActive(type)}
            className={tabClass(type)}
          >
            {tab(type)}
          </button>
        ),
      )}
    </div>
  )
}
