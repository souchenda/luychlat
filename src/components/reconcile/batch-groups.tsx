"use client"

import {
  ArrowDownLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  HistoryIcon,
  LandmarkIcon,
  PencilIcon,
  QrCodeIcon,
  ReceiptIcon,
  ShoppingBagIcon,
  Undo2Icon,
  UserRoundIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { categoryLabel } from "@/lib/categories/presets"
import type { Category, Wallet } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import type { LineDecision } from "@/lib/reconcile/api"
import { classifyLine, GROUP_ORDER, ownerMatchers, type LineGroup } from "@/lib/reconcile/classify"
import type { StatementLine } from "@/lib/reconcile/parse"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

const NONE = "__none"

const GROUP_ICON: Record<LineGroup, LucideIcon> = {
  REMEMBERED: HistoryIcon,
  SALES: QrCodeIcon,
  TRANSFER_IN: ArrowDownLeftIcon,
  OWNER: UserRoundIcon,
  BILLS: ReceiptIcon,
  EXPENSE: ShoppingBagIcon,
  FEE: LandmarkIcon,
  REVIEW: ClipboardListIcon,
}
const GROUP_TONE: Record<LineGroup, string> = {
  REMEMBERED: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  SALES: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  TRANSFER_IN: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  OWNER: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  BILLS: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  EXPENSE: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  FEE: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  REVIEW: "bg-muted text-muted-foreground",
}
/** Groups whose category the user can change for all lines at once. */
const PICKABLE: LineGroup[] = ["SALES", "TRANSFER_IN", "BILLS", "EXPENSE"]

const ownerNamesKey = (ws: string) => `luychlat-recon-owner-names-${ws}`
function loadOwnerNames(ws: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(ownerNamesKey(ws)) ?? "[]") as string[]
  } catch {
    return []
  }
}

/**
 * "Add to app" tab: lines sorted into groups (KHQR sales, own transfers,
 * bills, other spending, bank fees, same as last time), each approved with
 * one tap; only what fits nowhere is left for line-by-line review.
 */
export function BatchGroups({
  lines,
  decisions,
  decide,
  wallet,
  categories,
  business,
  remembered,
  accountName,
  profileName,
  renderReviewLine,
}: {
  lines: StatementLine[]
  decisions: Record<number, LineDecision>
  decide: (lineNo: number, d: LineDecision) => void
  wallet: Wallet
  categories: Category[]
  business: boolean
  /** Category id remembered for a line's description, if any. */
  remembered: (line: StatementLine) => string | null
  /** The account holder printed on the statement. */
  accountName: string | null
  profileName: string | null
  renderReviewLine: (line: StatementLine) => React.ReactNode
}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const ws = wallet.workspace_id
  const [extraNames, setExtraNames] = useState<string[]>(() => loadOwnerNames(ws))
  const [editingNames, setEditingNames] = useState(false)
  const [namesText, setNamesText] = useState("")
  const [moved, setMoved] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState<LineGroup | null>(null)
  const [picked, setPicked] = useState<Partial<Record<LineGroup, string>>>({})

  const owners = useMemo(() => ownerMatchers([accountName, profileName, ...extraNames]), [accountName, profileName, extraNames])
  const ownerLabel = owners.map((o) => o.join(" ")).join(" · ")

  const classified = useMemo(() => {
    const map = new Map<number, { group: LineGroup; preset: string | null }>()
    for (const line of lines) {
      if (moved.has(line.line_no)) map.set(line.line_no, { group: "REVIEW", preset: null })
      else map.set(line.line_no, classifyLine(line, { owners, business, remembered: Boolean(remembered(line)) }))
    }
    return map
  }, [lines, moved, owners, business, remembered])

  const groups = GROUP_ORDER.map((group) => ({ group, lines: lines.filter((l) => classified.get(l.line_no)!.group === group) })).filter((g) => g.lines.length > 0)

  const byPreset = (key: string | null, income: boolean) =>
    key ? categories.find((c) => c.preset_key === key && c.type === (income ? "INCOME" : "EXPENSE")) : undefined

  /** The category a group's lines get: the user's pick for the group, else its preset. */
  const groupCategory = (group: LineGroup, line: StatementLine): string | null => {
    const pick = picked[group]
    if (pick !== undefined) return pick === NONE ? null : pick
    return byPreset(classified.get(line.line_no)!.preset, line.amount > 0)?.id ?? null
  }

  const decisionFor = (group: LineGroup, line: StatementLine): LineDecision => {
    if (group === "REMEMBERED") return { action: "create", categoryId: remembered(line), fee: false }
    if (group === "FEE") return { action: "create", categoryId: null, fee: true }
    if (group === "OWNER") {
      const preset = line.amount > 0 ? "owner_contribution" : "owner_draw"
      return { action: "create", categoryId: byPreset(preset, line.amount > 0)?.id ?? null, fee: false, preset }
    }
    return { action: "create", categoryId: groupCategory(group, line), fee: false }
  }

  const approveAll = (group: LineGroup, groupLines: StatementLine[]) => groupLines.forEach((l) => decide(l.line_no, decisionFor(group, l)))
  const undoAll = (groupLines: StatementLine[]) => groupLines.forEach((l) => decide(l.line_no, { action: "none" }))
  const pickCategory = (group: LineGroup, groupLines: StatementLine[], value: string) => {
    setPicked((p) => ({ ...p, [group]: value }))
    // Already approved lines follow the new category.
    for (const l of groupLines) {
      if (decisions[l.line_no]?.action === "create") decide(l.line_no, { action: "create", categoryId: value === NONE ? null : value, fee: false })
    }
  }
  const moveToReview = (line: StatementLine) => {
    setMoved((m) => new Set(m).add(line.line_no))
    decide(line.line_no, { action: "none" })
  }
  const saveNames = () => {
    const names = namesText
      .split(/[,\n]/)
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 10)
    setExtraNames(names)
    try {
      localStorage.setItem(ownerNamesKey(ws), JSON.stringify(names))
    } catch {
      // Private mode: names last for this visit only.
    }
    setEditingNames(false)
  }

  const money = (n: number) => formatMoney(n, wallet.currency, { signed: true })
  const sum = (ls: StatementLine[]) => ls.reduce((s, l) => s + l.amount, 0)

  return (
    <div className="space-y-2 p-3">
      {/* Names used to spot transfers to/from the owner. */}
      <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
        {editingNames ? (
          <div className="space-y-2">
            <p className="text-muted-foreground">{t("recon.ownerNamesHint")}</p>
            <Input value={namesText} onChange={(e) => setNamesText(e.target.value)} placeholder="SOU CHENDA, SOU DARA" className="h-9 text-sm uppercase" maxLength={300} autoFocus />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditingNames(false)}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={saveNames}>
                {t("common.save")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <UserRoundIcon className="size-3.5 shrink-0 text-violet-500" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {t("recon.ownerNames")}: <span className="font-medium text-foreground">{ownerLabel || t("recon.ownerNamesNone")}</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => {
                setNamesText(extraNames.join(", "))
                setEditingNames(true)
              }}
            >
              <PencilIcon />
              {t("recon.ownerNamesEdit")}
            </Button>
          </div>
        )}
      </div>

      {groups.map(({ group, lines: groupLines }) => {
        const Icon = GROUP_ICON[group]
        const approved = groupLines.every((l) => decisions[l.line_no]?.action === "create")
        const total = sum(groupLines)
        const income = groupLines.every((l) => l.amount > 0)
        const expense = groupLines.every((l) => l.amount < 0)
        const pickable = PICKABLE.includes(group) && (income || expense)
        const options = categories.filter((c) => c.type === (income ? "INCOME" : "EXPENSE"))
        const current = pickable ? (groupCategory(group, groupLines[0]) ?? NONE) : NONE

        if (group === "REVIEW") {
          return (
            <section key={group} className="space-y-1 pt-2">
              <h3 className="flex items-center gap-2 px-1 text-sm font-semibold">
                <ClipboardListIcon className="size-4 text-amber-500" aria-hidden />
                {t("recon.group.REVIEW", { count: groupLines.length })}
              </h3>
              <p className="px-1 text-xs text-muted-foreground">{t("recon.groupHint.REVIEW")}</p>
              <div className="divide-y rounded-xl border">{groupLines.map((l) => renderReviewLine(l))}</div>
            </section>
          )
        }

        return (
          <section key={group} className={cn("rounded-xl border p-3", approved && "border-emerald-500/40 bg-emerald-500/5")}>
            <div className="flex items-start gap-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", GROUP_TONE[group])}>
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t(`recon.group.${group}${group === "SALES" && !business ? "_personal" : ""}` as MessageKey, { count: groupLines.length })}</p>
                <p className={cn("text-sm font-semibold tabular-nums", total >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>{money(total)}</p>
                <p className="text-[11px] text-muted-foreground">{t(`recon.groupHint.${group}` as MessageKey)}</p>
              </div>
            </div>

            {pickable && (
              <Select value={current} onValueChange={(v) => pickCategory(group, groupLines, v)}>
                <SelectTrigger size="sm" className="mt-2 w-full" aria-label={t("recon.category")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("recon.uncategorised")}</SelectItem>
                  {options.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {categoryLabel(c, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setOpen(open === group ? null : group)} aria-expanded={open === group}>
                <ChevronDownIcon className={cn("transition-transform", open === group && "rotate-180")} />
                {t(open === group ? "recon.hideLines" : "recon.showLines")}
              </Button>
              <div className="flex-1" />
              {approved ? (
                <>
                  <span className="flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckIcon className="size-4" aria-hidden />
                    {t("recon.approved")}
                  </span>
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => undoAll(groupLines)} aria-label={t("recon.undo")}>
                    <Undo2Icon />
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => approveAll(group, groupLines)}>
                  <CheckIcon />
                  {t("recon.approveAll")}
                </Button>
              )}
            </div>

            {open === group && (
              <ul className="mt-2 divide-y border-t">
                {groupLines.map((l) => (
                  <li key={l.line_no} className="flex items-center gap-2 py-1.5 text-xs">
                    <span className="w-10 shrink-0 text-muted-foreground tabular-nums">{`${l.posted_on.slice(8, 10)}/${l.posted_on.slice(5, 7)}`}</span>
                    <span className="min-w-0 flex-1 truncate">{l.description || "—"}</span>
                    <span className="shrink-0 font-medium tabular-nums">{money(l.amount)}</span>
                    <Button size="icon" variant="ghost" className="size-6 text-muted-foreground" onClick={() => moveToReview(l)} aria-label={t("recon.notThisGroup")}>
                      <XIcon className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
