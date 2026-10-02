"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Building2Icon, CheckIcon, ChevronDownIcon, CrownIcon, Loader2Icon, PlusIcon, UserIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { queryKeys, useActiveWorkspace, useRepo, useWorkspaces } from "@/lib/data/hooks"
import type { Workspace, WorkspaceType } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { showUpgrade, usePlan } from "@/lib/plan"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { usePrefsStore } from "@/stores/prefs-store"

const ICONS: Record<WorkspaceType, LucideIcon> = { PERSONAL: UserIcon, BUSINESS: Building2Icon, FAMILY: UsersIcon }

/** Ultra: name a new business workspace (its own wallets, ledger and reports). */
function AddBusinessSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const { scope } = useRepo()
  const setActive = usePrefsStore((s) => s.setActiveWorkspace)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return void toast.error(t("business.nameRequired"))
    setBusy(true)
    const { data, error } = await getSupabaseBrowserClient()!.rpc("create_business_workspace", { p_name: name.trim() })
    setBusy(false)
    if (error) {
      if (error.message.includes("plan_limit")) {
        onOpenChange(false)
        return showUpgrade("business")
      }
      return void toast.error(t("common.error"))
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces(scope) })
    setActive("BUSINESS", (data as Workspace).id)
    toast.success(t("business.created", { name: name.trim() }))
    setName("")
    onOpenChange(false)
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t("business.add")} description={t("business.addHint")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-business">{t("business.name")}</Label>
          <Input id="new-business" className="h-11" maxLength={60} autoFocus placeholder={t("business.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t("business.create")}
        </Button>
      </form>
    </BottomSheet>
  )
}

/**
 * One-tap Personal / Business toggle with a sliding indicator, plus a Family
 * tab once the user has (or joined) a family workspace. Tapping the active
 * Business (or Family) tab opens a picker: Ultra users switch between their
 * businesses and add new ones there.
 */
export function WorkspaceSwitcher() {
  const t = useT()
  const setActive = usePrefsStore((s) => s.setActiveWorkspace)
  const { workspace } = useActiveWorkspace()
  const { isUltra } = usePlan()
  const all = useWorkspaces().data ?? []
  const families = all.filter((w) => w.type === "FAMILY")
  const businesses = all.filter((w) => w.type === "BUSINESS")
  const [addOpen, setAddOpen] = useState(false)
  const options: WorkspaceType[] = families.length ? ["PERSONAL", "BUSINESS", "FAMILY"] : ["PERSONAL", "BUSINESS"]
  // The resolved workspace (Family falls back to Personal when it no longer exists).
  const preferred = usePrefsStore((s) => s.activeWorkspace)
  const active = workspace?.type ?? preferred
  const index = Math.max(0, options.indexOf(active))
  const width = `calc(${100 / options.length}% - ${0.5 / options.length}rem)`

  const tab = (type: WorkspaceType, extra?: React.ReactNode) => {
    const Icon = ICONS[type]
    const several = (type === "FAMILY" ? families : type === "BUSINESS" ? businesses : []).length > 1
    const label = several && workspace?.type === type ? workspace.name : t(`ws.${type}`)
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
  const addBusiness = () => (isUltra ? setAddOpen(true) : showUpgrade("business"))

  const picker = (type: "FAMILY" | "BUSINESS", list: Workspace[]) => (
    <DropdownMenu key={type}>
      <DropdownMenuTrigger asChild>
        <button type="button" role="tab" aria-selected className={tabClass(type)}>
          {tab(type, <ChevronDownIcon className="size-3 shrink-0" aria-hidden />)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={type === "FAMILY" ? "end" : "center"} className="min-w-56">
        {list.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => setActive(type, w.id)}>
            {type === "FAMILY" ? <UsersIcon /> : <Building2Icon />}
            <span className="flex-1 truncate">{w.name}</span>
            {w.id === workspace?.id && <CheckIcon className="text-primary" />}
          </DropdownMenuItem>
        ))}
        {type === "BUSINESS" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={addBusiness} className="text-primary">
              <PlusIcon />
              <span className="flex-1">{t("business.add")}</span>
              {!isUltra && <CrownIcon className="text-amber-500" aria-label="ULTRA" />}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <>
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
            picker("FAMILY", families)
          ) : type === "BUSINESS" && active === "BUSINESS" ? (
            // Active Business tab: list of businesses + "Add business".
            picker("BUSINESS", businesses)
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
      <AddBusinessSheet open={addOpen} onOpenChange={setAddOpen} />
    </>
  )
}
