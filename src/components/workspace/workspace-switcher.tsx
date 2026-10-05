"use client"

import { useQueryClient } from "@tanstack/react-query"
import { ArchiveIcon, ArrowLeftRightIcon, Building2Icon, CheckIcon, ChevronDownIcon, CrownIcon, Loader2Icon, PlusIcon, UserIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  const businesses = all.filter((w) => w.type === "BUSINESS" && !w.archived_at)
  const archived = all.filter((w) => w.type === "BUSINESS" && w.archived_at)
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
        {type === "BUSINESS" && archived.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("business.archivedList")}</DropdownMenuLabel>
            {archived.map((w) => (
              <DropdownMenuItem key={w.id} onSelect={() => setActive("BUSINESS", w.id)} className="text-muted-foreground">
                <ArchiveIcon />
                <span className="flex-1 truncate">{w.name}</span>
                {w.id === workspace?.id && <CheckIcon className="text-primary" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
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

const LAST_BUSINESS_KEY = "luychlat:last-business"
const LONG_PRESS_MS = 500

function readLastBusiness(): string | null {
  try {
    return localStorage.getItem(LAST_BUSINESS_KEY)
  } catch {
    return null
  }
}
function saveLastBusiness(id: string) {
  try {
    localStorage.setItem(LAST_BUSINESS_KEY, id)
  } catch {
    // Private mode / blocked storage: the first business is used instead.
  }
}
/** A short tick on phones that support it (Android); silently nothing elsewhere. */
const haptic = (ms = 10) => {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // Not supported.
  }
}

/**
 * Header: only the current workspace, as one compact pill — "👤 ផ្ទាល់ខ្លួន ⇄ ▾".
 * One tap flips Personal ⇄ the business used last (or the first one; Family
 * when there is no business); from any business or family it goes back to
 * Personal. Holding the pill (~0.5 s) or tapping ▾ opens the full list, with
 * every workspace and "Add business".
 */
export function WorkspaceFlip() {
  const t = useT()
  const setActive = usePrefsStore((s) => s.setActiveWorkspace)
  const { workspace } = useActiveWorkspace()
  const { isUltra } = usePlan()
  const all = useWorkspaces().data ?? []
  const [sheetOpen, setSheetOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [spin, setSpin] = useState(0)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)

  // Personal first, then businesses and families; archived businesses only in the sheet.
  const personal = all.find((w) => w.type === "PERSONAL" && w.role === "OWNER") ?? all.find((w) => w.type === "PERSONAL")
  const businesses = all.filter((w) => w.type === "BUSINESS" && !w.archived_at)
  const families = all.filter((w) => w.type === "FAMILY")
  const spaces = [personal, ...businesses, ...families].filter((w): w is Workspace => Boolean(w))
  const archived = all.filter((w) => w.type === "BUSINESS" && w.archived_at)
  const current = workspace ?? personal
  const label = (w: Workspace) => (w.type === "PERSONAL" ? t("ws.PERSONAL") : w.name)
  const go = (w: Workspace) => setActive(w.type, w.type === "PERSONAL" ? null : w.id)

  // Remember the business in use, for the next flip from Personal.
  useEffect(() => {
    if (current?.type === "BUSINESS") saveLastBusiness(current.id)
  }, [current?.id, current?.type])

  /** Where one tap goes: Personal → last business (first one, else a family); anything else → Personal. */
  const flipTarget = (): Workspace | undefined => {
    if (!current) return undefined
    if (current.type !== "PERSONAL") return personal
    const last = readLastBusiness()
    return businesses.find((w) => w.id === last) ?? businesses[0] ?? families[0]
  }
  const target = flipTarget()

  const openList = () => {
    haptic(15)
    setSheetOpen(true)
  }
  const tap = () => {
    // The click that ends a long press only opens the list.
    if (longPressed.current) {
      longPressed.current = false
      return
    }
    if (!target || target.id === current?.id) return openList()
    haptic()
    setSpin((n) => n + 1)
    go(target)
    toast(t("ws.switchedTo", { name: label(target) }), { duration: 1200, id: "ws-flip" })
  }
  const pressStart = () => {
    longPressed.current = false
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      longPressed.current = true
      openList()
    }, LONG_PRESS_MS)
  }
  const pressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }
  useEffect(() => () => pressEnd(), [])

  if (!current) return null
  const Icon = ICONS[current.type]

  return (
    <>
      <div className="inline-flex h-9 max-w-full items-center rounded-full border bg-muted/50 text-sm font-medium">
        <button
          type="button"
          onClick={tap}
          onPointerDown={pressStart}
          onPointerUp={pressEnd}
          onPointerLeave={pressEnd}
          onPointerCancel={pressEnd}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={target && target.id !== current.id ? t("ws.flipTo", { name: label(target) }) : t("ws.switch")}
          className="inline-flex h-full min-w-0 items-center gap-1.5 rounded-l-full py-1 pr-1.5 pl-3 transition-colors select-none [-webkit-touch-callout:none] hover:bg-muted active:scale-[0.98]"
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span key={current.id} className="truncate animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
            {label(current)}
          </span>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-background shadow-xs">
            <ArrowLeftRightIcon className="size-3.5 text-primary transition-transform duration-300" style={{ transform: `rotate(${spin * 180}deg)` }} aria-hidden />
          </span>
        </button>
        <button
          type="button"
          onClick={openList}
          aria-label={t("ws.openList")}
          aria-haspopup="dialog"
          className="flex h-full items-center rounded-r-full border-l pr-2 pl-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronDownIcon className="size-4" aria-hidden />
        </button>
      </div>

      <BottomSheet open={sheetOpen} onOpenChange={setSheetOpen} title={t("ws.switch")}>
        <div className="divide-y overflow-hidden rounded-2xl border">
          {[...spaces, ...archived].map((w) => {
            const WIcon = w.archived_at ? ArchiveIcon : ICONS[w.type]
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  go(w)
                  setSheetOpen(false)
                }}
                className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60", w.archived_at && "text-muted-foreground")}
              >
                <WIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{label(w)}</span>
                {w.id === current.id && <CheckIcon className="size-4 text-primary" aria-hidden />}
              </button>
            )
          })}
        </div>
        <Button
          variant="outline"
          className="mt-3 h-11 w-full"
          onClick={() => {
            setSheetOpen(false)
            if (isUltra) setAddOpen(true)
            else showUpgrade("business")
          }}
        >
          <PlusIcon />
          {t("business.add")}
          {!isUltra && <CrownIcon className="text-amber-500" aria-label="ULTRA" />}
        </Button>
      </BottomSheet>
      <AddBusinessSheet open={addOpen} onOpenChange={setAddOpen} />
    </>
  )
}
