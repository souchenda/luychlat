"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangleIcon,
  CheckIcon,
  CircleCheckIcon,
  CopyIcon,
  EyeOffIcon,
  Link2OffIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { BatchGroups } from "@/components/reconcile/batch-groups"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { categoryLabel } from "@/lib/categories/presets"
import { useActiveWorkspace, useCategories, useProfile, useRepo, useTransactionMutations } from "@/lib/data/hooks"
import type { Category, Transaction, Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount } from "@/lib/money"
import { showUpgrade } from "@/lib/plan"
import {
  ensureOwnerCategory,
  importErrorReason,
  importStatement,
  knownFingerprints,
  type ImportPayloadLine,
  type ImportResult,
  type LineDecision,
} from "@/lib/reconcile/api"
import type { StatementFile } from "@/lib/reconcile/file"
import { sha256Hex } from "@/lib/reconcile/file"
import { addDays, phnomPenhDayStart, toLedgerRows, walletEffect } from "@/lib/reconcile/ledger"
import { matchStatement, type MatchResult } from "@/lib/reconcile/match"
import type { StatementMeta } from "@/lib/reconcile/meta"
import { descriptionKey, loadCategoryMemory, rememberCategories } from "@/lib/reconcile/memory"
import { FEE_PATTERN, fingerprintKeys, type ParseResult, type StatementLine } from "@/lib/reconcile/parse"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

type Tab = "add" | "review" | "matched" | "app"
const FEE = "__fee"
const NONE = "__none"

const shortDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`
const round = (n: number, scale: number) => Math.round(n * 10 ** scale) / 10 ** scale

function Amount({ value, currency, className }: { value: number; currency: Wallet["currency"]; className?: string }) {
  return (
    <span className={cn("font-semibold tabular-nums", value > 0 ? "text-[#10B981]" : "text-[#F43F5E]", className)}>
      {formatMoney(value, currency, { signed: true })}
    </span>
  )
}

function LineHead({ line, currency }: { line: StatementLine; currency: Wallet["currency"] }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-11 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">{shortDate(line.posted_on)}</span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm">{line.description || "—"}</p>
        {line.bank_ref && <p className="truncate font-mono text-[11px] text-muted-foreground">{line.bank_ref}</p>}
      </div>
      <Amount value={line.amount} currency={currency} className="text-sm" />
    </div>
  )
}

/** Compare → resolve → save. Matching runs once on load; later edits only change decisions. */
export function ReviewStep({
  wallet,
  file,
  parsed,
  meta,
  onBack,
  onDone,
}: {
  wallet: Wallet
  file: StatementFile
  parsed: ParseResult
  /** Bank, account holder… read from the statement (lib/reconcile/meta). */
  meta?: StatementMeta | null
  onBack: () => void
  onDone: (result: ImportResult) => void
}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const queryClient = useQueryClient()
  const { repo, scope } = useRepo()
  const ws = wallet.workspace_id
  const scale = wallet.currency === "KHR" ? 0 : 2
  const { remove } = useTransactionMutations(ws)
  const categories = useCategories(ws).data
  const categoryMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const business = useActiveWorkspace().workspace?.type === "BUSINESS"
  const profileName = useProfile().data?.display_name ?? null

  // Everything on this wallet from 3 days before the statement until now
  // (rows after the statement end are needed for the balance "as of" its end).
  const ledgerQuery = useQuery({
    queryKey: ["transactions", scope, ws, "recon", wallet.id, parsed.period_start],
    queryFn: () => repo.listTransactions(ws, { walletId: wallet.id, from: phnomPenhDayStart(addDays(parsed.period_start, -3)) }),
  })
  const fingerprints = useQuery({
    queryKey: ["recon-fingerprints", wallet.id, file.sha256],
    staleTime: Infinity,
    queryFn: async () => {
      const keys = await Promise.all(fingerprintKeys(parsed.lines, scale).map((k) => sha256Hex(k)))
      return { keys, known: await knownFingerprints(wallet.id, keys) }
    },
  })

  const [analysis, setAnalysis] = useState<MatchResult | null>(null)
  const [decisions, setDecisions] = useState<Record<number, LineDecision>>({})
  const [suggestions, setSuggestions] = useState<Record<number, { txId: string; score: number }>>({})
  const [deleted, setDeleted] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<Tab>("add")
  const [closingText, setClosingText] = useState(parsed.closing_balance === null ? "" : String(parsed.closing_balance))
  const [align, setAlign] = useState(true)

  const known = fingerprints.data?.known
  const freshLines = useMemo(
    () => (fingerprints.data ? parsed.lines.filter((_, i) => !known!.has(fingerprints.data!.keys[i])) : []),
    [parsed.lines, fingerprints.data, known],
  )

  useEffect(() => {
    if (analysis || !ledgerQuery.data || !fingerprints.data || !categories) return
    const rows = toLedgerRows(ledgerQuery.data, wallet, categoryMap, locale)
    const result = matchStatement(freshLines, rows, { start: parsed.period_start, end: parsed.period_end })
    const initial: Record<number, LineDecision> = {}
    const pending: Record<number, { txId: string; score: number }> = {}
    for (const line of freshLines) {
      const m = result.lines.get(line.line_no)!
      if (m.kind === "matched") initial[line.line_no] = { action: "match", txId: m.txId, score: m.score }
      else {
        if (m.kind === "suggested") pending[line.line_no] = { txId: m.txId, score: m.score }
        initial[line.line_no] = { action: "none" }
      }
    }
    setAnalysis(result)
    setDecisions(initial)
    setSuggestions(pending)
    const addCount = freshLines.filter((l) => initial[l.line_no].action === "none" && !pending[l.line_no]).length
    setTab(addCount ? "add" : Object.keys(pending).length ? "review" : "matched")
  }, [analysis, ledgerQuery.data, fingerprints.data, categories, categoryMap, freshLines, locale, parsed, wallet, ws])

  const ledger = useMemo(() => (ledgerQuery.data ?? []).filter((x) => !deleted.has(x.id)), [ledgerQuery.data, deleted])
  const txById = useMemo(() => new Map(ledger.map((x) => [x.id, x])), [ledger])
  const memory = useMemo(() => loadCategoryMemory(ws), [ws])
  const rememberedCategory = useCallback(
    (line: StatementLine) => {
      const c = categoryMap.get(memory[descriptionKey(line.description)] ?? "")
      return c && c.type === (line.amount > 0 ? "INCOME" : "EXPENSE") ? c.id : null
    },
    [memory, categoryMap],
  )

  const defaultCreate = (line: StatementLine): LineDecision => {
    const remembered = memory[descriptionKey(line.description)]
    const c = remembered ? categoryMap.get(remembered) : undefined
    if (c && c.type === (line.amount > 0 ? "INCOME" : "EXPENSE")) return { action: "create", categoryId: c.id, fee: false }
    return { action: "create", categoryId: null, fee: line.amount < 0 && FEE_PATTERN.test(line.description) }
  }
  const decide = (lineNo: number, d: LineDecision) => setDecisions((all) => ({ ...all, [lineNo]: d }))
  const dismissSuggestion = (lineNo: number) =>
    setSuggestions((all) => {
      const next = { ...all }
      delete next[lineNo]
      return next
    })

  // Groups
  const matchedLines = freshLines.filter((l) => decisions[l.line_no]?.action === "match")
  const reviewLines = freshLines.filter((l) => decisions[l.line_no]?.action === "none" && suggestions[l.line_no])
  const addLines = freshLines.filter((l) => decisions[l.line_no] && decisions[l.line_no].action !== "match" && !(decisions[l.line_no].action === "none" && suggestions[l.line_no]))
  const linked = new Set<string>([
    ...Object.values(decisions).flatMap((d) => (d.action === "match" ? [d.txId] : [])),
    ...Object.values(suggestions).map((s) => s.txId),
  ])
  const duplicateOf = new Map((analysis?.appOnly ?? []).map((a) => [a.id, a.duplicateOf]))
  const appOnly = ledger.filter((x) => {
    if (linked.has(x.id) || x.reconciled_at) return false
    const effect = walletEffect(x, wallet)
    const day = toLedgerRows([x], wallet, categoryMap, locale)[0].date
    return effect !== 0 && day >= parsed.period_start && day <= parsed.period_end
  })

  // Balance on the statement's last day, after this save.
  const periodEndIso = phnomPenhDayStart(addDays(parsed.period_end, 1))
  const after = ledger.filter((x) => x.transaction_date >= periodEndIso).reduce((s, x) => s + walletEffect(x, wallet), 0)
  const createdSum = freshLines.reduce((s, l) => s + (decisions[l.line_no]?.action === "create" ? l.amount : 0), 0)
  const appAsOf = round(wallet.balance - after + createdSum, scale)
  const closing = parsed.closing_balance ?? (closingText.trim() ? parseAmount(closingText) : null)
  const diff = closing === null ? null : round(closing - appAsOf, scale)

  const save = useMutation({
    mutationFn: async () => {
      const keys = fingerprints.data!.keys
      // Owner draw/contribution categories are created the first time they're used.
      const presetIds = new Map<string, string>()
      for (const d of Object.values(decisions)) {
        if (d.action === "create" && !d.categoryId && d.preset && !presetIds.has(d.preset)) presetIds.set(d.preset, await ensureOwnerCategory(ws, d.preset))
      }
      const lines: ImportPayloadLine[] = parsed.lines.flatMap((l, i) => {
        if (known!.has(keys[i])) return []
        const d = decisions[l.line_no] ?? { action: "none" }
        return [
          {
            line_no: l.line_no,
            posted_on: l.posted_on,
            amount: l.amount,
            description: l.description,
            bank_ref: l.bank_ref,
            running_balance: l.running_balance,
            fingerprint: keys[i],
            action: d.action,
            ...(d.action === "match" ? { transaction_id: d.txId, score: d.score } : {}),
            ...(d.action === "create" ? { category_id: d.categoryId ?? (d.preset ? presetIds.get(d.preset) : null) ?? null, fee: d.fee } : {}),
          },
        ]
      })
      return importStatement(
        wallet.id,
        {
          bank: meta?.bank ?? "GENERIC",
          source_format: file.format,
          file_sha256: file.sha256,
          period_start: parsed.period_start,
          period_end: parsed.period_end,
          opening_balance: parsed.opening_balance,
          closing_balance: closing,
          adjust_note: t("recon.adjustNote", { date: `${shortDate(parsed.period_end)}/${parsed.period_end.slice(0, 4)}` }),
        },
        lines,
        align && diff !== null && diff !== 0,
      )
    },
    onSuccess: (result) => {
      rememberCategories(
        ws,
        freshLines.flatMap((l) => {
          const d = decisions[l.line_no]
          return d?.action === "create" && d.categoryId ? [{ description: l.description, categoryId: d.categoryId }] : []
        }),
      )
      for (const key of ["wallets", "transactions", "categories"]) void queryClient.invalidateQueries({ queryKey: [key] })
      onDone(result)
    },
    onError: (error) => {
      const reason = importErrorReason(error)
      if (reason === "plan_required") return showUpgrade("reconcile")
      toast.error(t(`recon.error.${reason}`))
    },
  })

  if (!analysis || !fingerprints.data) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2Icon className="size-6 animate-spin" />
        {t("recon.comparing")}
      </div>
    )
  }

  const alreadyImported = parsed.lines.length - freshLines.length
  const txLabel = (x: Transaction) => {
    const c = x.category_id ? categoryMap.get(x.category_id) : undefined
    return x.note || (c ? categoryLabel(c, locale) : t(x.type === "TRANSFER" ? "recon.transfer" : "recon.noNote"))
  }
  const categoryOptions = (line: StatementLine): Category[] =>
    (categories ?? []).filter((c) => c.type === (line.amount > 0 ? "INCOME" : "EXPENSE"))

  const renderAddLine = (line: StatementLine) => {
              const d = decisions[line.line_no]
              return (
                <div key={line.line_no} className={cn("space-y-2 px-4 py-3", d.action === "ignore" && "opacity-60")}>
                  <LineHead line={line} currency={wallet.currency} />
                  {d.action === "none" && (
                    <div className="flex gap-2 pl-13">
                      <Button size="sm" variant="secondary" className="flex-1" onClick={() => decide(line.line_no, defaultCreate(line))}>
                        <PlusIcon />
                        {t("recon.add")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => decide(line.line_no, { action: "ignore" })}>
                        <EyeOffIcon />
                        {t("recon.ignore")}
                      </Button>
                    </div>
                  )}
                  {d.action === "create" && (
                    <div className="flex items-center gap-2 pl-13">
                      <Select
                        value={d.fee ? FEE : (d.categoryId ?? NONE)}
                        onValueChange={(v) =>
                          decide(line.line_no, { action: "create", categoryId: v === FEE || v === NONE ? null : v, fee: v === FEE })
                        }
                      >
                        <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label={t("recon.category")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>{t("recon.uncategorised")}</SelectItem>
                          {line.amount < 0 && <SelectItem value={FEE}>{t("recon.bankFee")}</SelectItem>}
                          {categoryOptions(line).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {categoryLabel(c, locale)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => decide(line.line_no, { action: "none" })} aria-label={t("recon.undo")}>
                        <Undo2Icon className="size-4" />
                      </Button>
                    </div>
                  )}
                  {d.action === "ignore" && (
                    <div className="flex items-center gap-2 pl-13 text-xs text-muted-foreground">
                      <span className="flex-1">{t("recon.ignored")}</span>
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => decide(line.line_no, { action: "none" })}>
                        <Undo2Icon />
                        {t("recon.undo")}
                      </Button>
                    </div>
                  )}
                </div>
              )
  }

  const tabs: { id: Tab; label: string; count: number; tone: string }[] = [
    { id: "add", label: t("recon.tab.add"), count: addLines.length, tone: "text-[#F43F5E]" },
    { id: "review", label: t("recon.tab.review"), count: reviewLines.length, tone: "text-amber-600" },
    { id: "matched", label: t("recon.tab.matched"), count: matchedLines.length, tone: "text-[#10B981]" },
    { id: "app", label: t("recon.tab.app"), count: appOnly.length, tone: "text-muted-foreground" },
  ]

  return (
    <div className="space-y-4">
      {alreadyImported > 0 && (
        <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <CopyIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("recon.alreadyImported", { count: alreadyImported })}
        </p>
      )}

      <div role="tablist" aria-label={t("recon.title")} className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cn(
              "flex flex-col items-center rounded-lg px-1 py-1.5 text-[11px] leading-tight transition-colors",
              tab === x.id ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            <span className={cn("text-base font-bold tabular-nums", x.count > 0 && x.tone)}>{x.count}</span>
            {x.label}
          </button>
        ))}
      </div>

      <Card className="gap-0 divide-y py-0" role="tabpanel">
        {tab === "add" &&
          (addLines.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("recon.nothingToAdd")}</p>
          ) : (
            <BatchGroups
              lines={addLines}
              decisions={decisions}
              decide={decide}
              wallet={wallet}
              categories={categories ?? []}
              business={business}
              remembered={rememberedCategory}
              accountName={meta?.accountName ?? null}
              profileName={profileName}
              renderReviewLine={renderAddLine}
            />
          ))}

        {tab === "review" && (
          <>
            {reviewLines.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("recon.nothingToReview")}</p>}
            {reviewLines.map((line) => {
              const s = suggestions[line.line_no]
              const x = txById.get(s.txId)
              return (
                <div key={line.line_no} className="space-y-2 px-4 py-3">
                  <LineHead line={line} currency={wallet.currency} />
                  {x && (
                    <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                      {t("recon.sameAs", { date: shortDate(toLedgerRows([x], wallet, categoryMap, locale)[0].date), name: txLabel(x) })}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant="outline" onClick={() => dismissSuggestion(line.line_no)}>
                      {t("recon.notSame")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        decide(line.line_no, { action: "match", txId: s.txId, score: s.score })
                        dismissSuggestion(line.line_no)
                      }}
                    >
                      <CheckIcon />
                      {t("recon.confirm")}
                    </Button>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {tab === "matched" && (
          <>
            {matchedLines.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t("recon.nothingMatched")}</p>}
            {matchedLines.map((line) => {
              const d = decisions[line.line_no] as Extract<LineDecision, { action: "match" }>
              const x = txById.get(d.txId)
              return (
                <div key={line.line_no} className="space-y-1 px-4 py-3">
                  <LineHead line={line} currency={wallet.currency} />
                  <div className="flex items-center gap-2 pl-13 text-xs text-muted-foreground">
                    <CircleCheckIcon className="size-3.5 shrink-0 text-[#10B981]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{x ? txLabel(x) : "—"}</span>
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => decide(line.line_no, { action: "none" })} aria-label={t("recon.unlink")}>
                      <Link2OffIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {tab === "app" && (
          <>
            <p className="px-4 py-3 text-xs text-muted-foreground">{t("recon.appOnlyHint")}</p>
            {appOnly.map((x) => {
              const dup = duplicateOf.get(x.id)
              const row = toLedgerRows([x], wallet, categoryMap, locale)[0]
              return (
                <div key={x.id} className="flex items-start gap-2 px-4 py-3">
                  <span className="w-11 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">{shortDate(row.date)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{txLabel(x)}</p>
                    {dup && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-600">
                        <AlertTriangleIcon className="size-3" aria-hidden />
                        {t("recon.possibleDuplicate")}
                      </p>
                    )}
                  </div>
                  <Amount value={row.amount} currency={wallet.currency} className="text-sm" />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground"
                    aria-label={t("recon.deleteTx")}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (!window.confirm(t("recon.deleteConfirm", { name: txLabel(x) }))) return
                      remove.mutate(x.id, {
                        onSuccess: () => setDeleted((s) => new Set(s).add(x.id)),
                        onError: () => toast.error(t("common.error")),
                      })
                    }}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              )
            })}
          </>
        )}
      </Card>

      {/* Finish: balances + save */}
      <Card className="gap-3 px-4 py-4">
        <div className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-muted-foreground">{t("recon.appAsOf", { date: shortDate(parsed.period_end) })}</span>
          <span className="text-right font-medium tabular-nums">{formatMoney(appAsOf, wallet.currency)}</span>
          <span className="text-muted-foreground">{t("recon.bankAsOf", { date: shortDate(parsed.period_end) })}</span>
          {parsed.closing_balance !== null ? (
            <span className="text-right font-medium tabular-nums">{formatMoney(parsed.closing_balance, wallet.currency)}</span>
          ) : (
            <Input
              value={closingText}
              onChange={(e) => setClosingText(e.target.value)}
              inputMode="decimal"
              placeholder={t("recon.closingPlaceholder")}
              className="h-8 text-right tabular-nums"
              aria-label={t("recon.bankAsOf", { date: shortDate(parsed.period_end) })}
            />
          )}
        </div>
        {diff !== null &&
          (diff === 0 ? (
            <p className="flex items-center gap-2 text-sm font-medium text-[#10B981]">
              <CircleCheckIcon className="size-4" aria-hidden />
              {t("recon.balanced")}
            </p>
          ) : (
            <div className="space-y-2 rounded-xl bg-muted/60 p-3">
              <p className="text-sm">
                {t("recon.difference")} <Amount value={diff} currency={wallet.currency} />
              </p>
              <div className="flex items-center gap-3">
                <Label htmlFor="recon-align" className="flex-1 text-xs font-normal text-muted-foreground">
                  {t("recon.alignHint")}
                </Label>
                <Switch id="recon-align" checked={align} onCheckedChange={setAlign} />
              </div>
            </div>
          ))}
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="outline" className="h-12" onClick={onBack} disabled={save.isPending}>
            {t("common.back")}
          </Button>
          <Button className="h-12 text-base" onClick={() => save.mutate()} disabled={save.isPending || freshLines.length === 0}>
            {save.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
            {t("recon.save")}
          </Button>
        </div>
        {freshLines.length === 0 && <p className="text-center text-xs text-muted-foreground">{t("recon.error.already_imported")}</p>}
      </Card>
    </div>
  )
}
