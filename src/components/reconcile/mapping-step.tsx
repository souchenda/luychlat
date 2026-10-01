"use client"

import { AlertTriangleIcon, CheckCircle2Icon, FileSpreadsheetIcon, InfoIcon } from "lucide-react"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Currency } from "@/lib/data/types"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import type { StatementFile } from "@/lib/reconcile/file"
import { buildStatement, type ColumnRole, type DateOrder, type Mapping, type ParseResult } from "@/lib/reconcile/parse"
import { cn } from "@/lib/utils"

const ROLES: ColumnRole[] = ["ignore", "date", "description", "ref", "amount", "debit", "credit", "balance"]
const ORDERS: DateOrder[] = ["DMY", "MDY", "YMD"]

const fmtDate = (ymd: string) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : "")

/** Confirm how the file's columns are read; the preview re-parses live. */
export function MappingStep({
  file,
  mapping,
  onMappingChange,
  currency,
  onBack,
  onContinue,
}: {
  file: StatementFile
  mapping: Mapping
  onMappingChange: (mapping: Mapping) => void
  currency: Currency
  onBack: () => void
  onContinue: (result: ParseResult) => void
}) {
  const t = useT()
  const scale = currency === "KHR" ? 0 : 2
  const result = useMemo(() => buildStatement(file.rows, mapping, scale), [file.rows, mapping, scale])
  const header = file.rows[mapping.headerRow] ?? []
  const width = Math.max(header.length, ...file.rows.slice(mapping.headerRow, mapping.headerRow + 6).map((r) => r.length))
  const roles = mapping.roles
  const hasDate = roles.includes("date")
  const hasMoney = roles.includes("amount") || roles.includes("debit") || roles.includes("credit")
  const canContinue = hasDate && hasMoney && result.lines.length > 0 && result.balance.kind !== "mismatch"

  const setRole = (index: number, role: ColumnRole) => {
    const next = Array.from({ length: width }, (_, i) => roles[i] ?? "ignore")
    // One column per role: the previous holder becomes "ignore".
    if (role !== "ignore") next.forEach((r, i) => r === role && i !== index && (next[i] = "ignore"))
    next[index] = role
    onMappingChange({ ...mapping, roles: next })
  }

  return (
    <div className="space-y-4">
      <Card className="gap-3 px-4 py-4">
        <div className="flex items-center gap-2 text-sm">
          <FileSpreadsheetIcon className="size-5 shrink-0 text-emerald-600" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
          <span className="text-xs text-muted-foreground">{file.format}</span>
        </div>
        <p className="text-xs text-muted-foreground">{t("recon.mapHint", { currency })}</p>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>{t("recon.headerRow")}</Label>
            <Select value={String(mapping.headerRow)} onValueChange={(v) => onMappingChange({ ...mapping, headerRow: Number(v) })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {file.rows.slice(0, 40).map((row, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {i + 1}: {row.filter(Boolean).slice(0, 3).join(" · ").slice(0, 32) || "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("recon.dateOrder")}</Label>
            <Select value={mapping.dateOrder} onValueChange={(v) => onMappingChange({ ...mapping, dateOrder: v as DateOrder })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDERS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {t(`recon.dateOrder.${o}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Columns: role picker above a few sample rows. */}
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="text-xs">
            <thead>
              <tr>
                {Array.from({ length: width }, (_, i) => (
                  <th key={i} className="min-w-28 p-1 text-left align-bottom font-normal">
                    <Select value={roles[i] ?? "ignore"} onValueChange={(v) => setRole(i, v as ColumnRole)}>
                      <SelectTrigger
                        size="sm"
                        className={cn("w-full", (roles[i] ?? "ignore") !== "ignore" && "border-primary text-primary")}
                        aria-label={t("recon.columnRole", { name: header[i] || String(i + 1) })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {t(`recon.role.${r}` as MessageKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 truncate px-1 font-medium text-muted-foreground">{header[i] || "—"}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {file.rows.slice(mapping.headerRow + 1, mapping.headerRow + 6).map((row, r) => (
                <tr key={r} className="border-t">
                  {Array.from({ length: width }, (_, i) => (
                    <td key={i} className="max-w-36 truncate p-1 text-muted-foreground">
                      {row[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* What we read */}
      <Card className="gap-2 px-4 py-4 text-sm">
        {!hasDate || !hasMoney ? (
          <p className="flex gap-2 text-amber-700 dark:text-amber-400">
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("recon.needColumns")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              <span className="text-muted-foreground">{t("recon.lines")}</span>
              <span className="text-right font-medium tabular-nums">{result.lines.length}</span>
              <span className="text-muted-foreground">{t("recon.period")}</span>
              <span className="text-right tabular-nums">
                {fmtDate(result.period_start)} – {fmtDate(result.period_end)}
              </span>
              {result.opening_balance !== null && (
                <>
                  <span className="text-muted-foreground">{t("recon.opening")}</span>
                  <span className="text-right tabular-nums">{formatMoney(result.opening_balance, currency)}</span>
                </>
              )}
              {result.closing_balance !== null && (
                <>
                  <span className="text-muted-foreground">{t("recon.closing")}</span>
                  <span className="text-right font-medium tabular-nums">{formatMoney(result.closing_balance, currency)}</span>
                </>
              )}
            </div>
            {result.balance.kind === "ok" && (
              <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
                {t("recon.balanceOk")}
              </p>
            )}
            {result.balance.kind === "none" && (
              <p className="flex gap-2 text-xs text-muted-foreground">
                <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("recon.balanceNone")}
              </p>
            )}
            {result.balance.kind === "mismatch" && (
              <p className="flex gap-2 text-destructive">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("recon.balanceMismatch", {
                  row: result.balance.fileRow,
                  expected: formatMoney(result.balance.expected, currency),
                  found: formatMoney(result.balance.found, currency),
                })}
              </p>
            )}
            {result.badRows.length > 0 && (
              <p className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("recon.badRows", { rows: result.badRows.slice(0, 5).join(", ") + (result.badRows.length > 5 ? "…" : "") })}
              </p>
            )}
          </>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button className="h-12" disabled={!canContinue} onClick={() => onContinue(result)}>
          {t("recon.compare")}
        </Button>
      </div>
    </div>
  )
}
