"use client"

import { ArrowLeftIcon, CircleCheckIcon, CrownIcon, FileUpIcon, Loader2Icon, LockIcon, ScanSearchIcon, SparklesIcon } from "lucide-react"
import Link from "next/link"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { MappingStep } from "@/components/reconcile/mapping-step"
import { ReviewStep } from "@/components/reconcile/review-step"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { canWrite, useActiveWorkspace, useWalletMutations, useWallets } from "@/lib/data/hooks"
import type { Currency, Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney, parseAmount, roundMoney } from "@/lib/money"
import { showUpgrade, usePlan } from "@/lib/plan"
import { isFileImported, type ImportResult } from "@/lib/reconcile/api"
import { readStatementFile, StatementFileError, type StatementFile } from "@/lib/reconcile/file"
import { loadMapping, saveMapping } from "@/lib/reconcile/memory"
import { extractMeta, maskAccount, withMetaBalances, type StatementMeta } from "@/lib/reconcile/meta"
import { buildStatement, guessMapping, type Mapping, type ParseResult } from "@/lib/reconcile/parse"
import { cn } from "@/lib/utils"

type Step =
  | { kind: "upload" }
  | { kind: "account"; file: StatementFile; mapping: Mapping; meta: StatementMeta; opening: number | null }
  | { kind: "map"; file: StatementFile; mapping: Mapping; meta: StatementMeta; wallet: Wallet }
  | { kind: "review"; file: StatementFile; mapping: Mapping; meta: StatementMeta; wallet: Wallet; parsed: ParseResult }
  | { kind: "done"; wallet: Wallet; result: ImportResult }

const NEW = "__new"
const BANK_ICON: Record<StatementMeta["bank"], string> = { ABA: "aba", ACLEDA: "acleda", GENERIC: "other" }
const BANK_NAME: Record<StatementMeta["bank"], string> = { ABA: "ABA", ACLEDA: "ACLEDA", GENERIC: "" }
const fmt = (ymd: string | null) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : "—")

/** Shown while a file is read: what is happening right now. */
function Progress({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 text-sm">
      <Loader2Icon className="size-5 animate-spin text-primary" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

/** Step 2: what was read from the statement; import into a new wallet (default) or an existing one. */
function AccountStep({
  step,
  wallets,
  onBack,
  onContinue,
}: {
  step: Extract<Step, { kind: "account" }>
  wallets: Wallet[]
  onBack: () => void
  onContinue: (wallet: Wallet) => void
}) {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const { create } = useWalletMutations(workspace?.id)
  const { meta } = step
  const bankName = BANK_NAME[meta.bank]
  const masked = maskAccount(meta.accountNumber)
  const [target, setTarget] = useState(NEW)
  const [currency, setCurrency] = useState<Currency>(meta.currency ?? "USD")
  const [name, setName] = useState([bankName || t("stmt.bankAccount"), masked].filter(Boolean).join(" "))
  const [openingText, setOpeningText] = useState(step.opening === null ? "" : String(step.opening))
  const sameCurrency = wallets.filter((w) => !w.archived_at && w.currency === currency && w.goal_target == null)

  const go = async () => {
    if (target !== NEW) {
      const w = wallets.find((x) => x.id === target)
      if (w) onContinue(w)
      return
    }
    const opening = openingText.trim() ? parseAmount(openingText) : 0
    if (!name.trim()) return void toast.error(t("stmt.nameRequired"))
    if (!Number.isFinite(opening)) return void toast.error(t("walletForm.amountInvalid"))
    try {
      const wallet = await create.mutateAsync({
        name: name.trim().slice(0, 60),
        icon: BANK_ICON[meta.bank],
        color: null,
        visibility: "SHARED",
        currency,
        balance: roundMoney(opening, currency),
      })
      onContinue(wallet)
    } catch {
      toast.error(t("common.error"))
    }
  }

  const facts: [string, string | null][] = [
    [t("stmt.bank"), bankName || t("stmt.bankUnknown")],
    [t("stmt.holder"), meta.accountName],
    [t("stmt.account"), masked],
    [t("stmt.currency"), meta.currency],
    [t("stmt.period"), meta.periodStart ? `${fmt(meta.periodStart)} – ${fmt(meta.periodEnd)}` : null],
    [t("stmt.opening"), meta.openingBalance !== null && meta.currency ? formatMoney(meta.openingBalance, meta.currency) : step.opening !== null ? formatMoney(step.opening, currency) : null],
    [t("stmt.closing"), meta.closingBalance !== null && meta.currency ? formatMoney(meta.closingBalance, meta.currency) : null],
  ]

  return (
    <div className="space-y-4">
      <Card className="gap-2 px-4 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ScanSearchIcon className="size-4 text-primary" aria-hidden />
          {t("stmt.detected")}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className={cn("text-right font-medium tabular-nums", !value && "font-normal text-muted-foreground")}>{value ?? t("stmt.notFound")}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="gap-3 px-4 py-4">
        <Label>{t("stmt.into")}</Label>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NEW}>{t("stmt.newWallet")}</SelectItem>
            {sameCurrency.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name} · {formatMoney(w.balance, w.currency)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {target === NEW ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="imp-name">{t("stmt.walletName")}</Label>
              <Input id="imp-name" className="h-11" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="imp-opening">{t("stmt.openingBalance")}</Label>
                <Input id="imp-opening" inputMode="decimal" className="h-11 tabular-nums" placeholder="0" value={openingText} onChange={(e) => setOpeningText(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("stmt.currency")}</Label>
                <Segmented
                  aria-label={t("stmt.currency")}
                  value={currency}
                  onChange={(v) => setCurrency(v as Currency)}
                  options={[
                    { value: "USD", label: "$" },
                    { value: "KHR", label: "៛" },
                  ]}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("stmt.openingHint")}</p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t("stmt.existingHint")}</p>
        )}

        <div className="grid grid-cols-[auto_1fr] gap-2 pt-1">
          <Button variant="outline" className="h-12" onClick={onBack} disabled={create.isPending}>
            {t("common.back")}
          </Button>
          <Button className="h-12 text-base" onClick={() => void go()} disabled={create.isPending}>
            {create.isPending && <Loader2Icon className="animate-spin" />}
            {t(target === NEW ? "stmt.createAndContinue" : "stmt.continue")}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/**
 * Wallets › Import a bank statement: read an ABA/ACLEDA (or any) export on the
 * device, set up the wallet from it (opening balance included) and approve
 * the transactions in a few grouped taps.
 */
export default function ImportStatementPage() {
  const t = useT()
  const { workspace } = useActiveWorkspace()
  const wallets = useWallets(workspace?.id)
  const { isPro, loading } = usePlan()
  const [step, setStep] = useState<Step>({ kind: "upload" })
  const [phase, setPhase] = useState<"reading" | "detecting" | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const pick = async (picked: File | undefined) => {
    if (!picked) return
    setPhase("reading")
    try {
      const file = await readStatementFile(picked)
      setPhase("detecting")
      const mapping = guessMapping(file.rows) ?? { headerRow: 0, roles: [], dateOrder: "DMY" as const }
      const meta = extractMeta(file.rows, mapping.headerRow, mapping.dateOrder, file.name)
      // No opening balance printed: work it out from the first running balance.
      const opening = meta.openingBalance ?? (guessMapping(file.rows) ? buildStatement(file.rows, mapping, meta.currency === "KHR" ? 0 : 2).opening_balance : null)
      setStep({ kind: "account", file, mapping, meta, opening })
    } catch (error) {
      toast.error(error instanceof StatementFileError ? t(`recon.file.${error.code}`) : t("common.error"))
    } finally {
      setPhase(null)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const header = (
    <div className="flex items-center gap-1">
      <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
        <Link href="/wallets">
          <ArrowLeftIcon />
        </Link>
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{t("stmt.title")}</h1>
    </div>
  )

  if (loading || wallets.isLoading) return <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />

  if (!isPro || !canWrite(workspace)) {
    return (
      <div className="space-y-5">
        {header}
        <Card className="items-center gap-3 px-6 py-8 text-center">
          <SparklesIcon className="size-8 text-primary" aria-hidden />
          <p className="font-semibold">{t("stmt.proTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("stmt.intro")}</p>
          {!isPro && (
            <Button onClick={() => showUpgrade("reconcile")}>
              <CrownIcon />
              {t("upgrade.cta")}
            </Button>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {header}

      {step.kind === "upload" && (
        <Card className="gap-4 px-5 py-6">
          <p className="text-sm text-muted-foreground">{t("stmt.intro")}</p>
          <ul className="space-y-1.5 text-sm">
            {(["stmt.point1", "stmt.point2", "stmt.point3"] as const).map((k) => (
              <li key={k} className="flex gap-2">
                <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                {t(k)}
              </li>
            ))}
          </ul>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="sr-only"
            onChange={(e) => void pick(e.target.files?.[0])}
            aria-label={t("recon.chooseFile")}
          />
          {phase ? (
            <Progress label={t(phase === "reading" ? "stmt.reading" : "stmt.detecting")} />
          ) : (
            <Button className="h-12 text-base" onClick={() => inputRef.current?.click()}>
              <FileUpIcon />
              {t("recon.chooseFile")}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{t("stmt.formats")}</p>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("recon.privacy")}
          </p>
        </Card>
      )}

      {step.kind === "account" && (
        <AccountStep
          step={step}
          wallets={wallets.data ?? []}
          onBack={() => setStep({ kind: "upload" })}
          onContinue={async (wallet) => {
            // The same file can't go into the same wallet twice.
            if (await isFileImported(wallet.id, step.file.sha256).catch(() => false)) return void toast.error(t("recon.error.already_imported"))
            setStep({ kind: "map", file: step.file, meta: step.meta, wallet, mapping: loadMapping(wallet.id, step.file.rows) ?? step.mapping })
          }}
        />
      )}

      {step.kind === "map" && (
        <MappingStep
          file={step.file}
          mapping={step.mapping}
          currency={step.wallet.currency}
          onMappingChange={(mapping) => setStep({ ...step, mapping })}
          onBack={() => setStep({ kind: "upload" })}
          onContinue={(parsed) => {
            saveMapping(step.wallet.id, step.file.rows, step.mapping)
            const meta = extractMeta(step.file.rows, step.mapping.headerRow, step.mapping.dateOrder, step.file.name)
            setStep({ ...step, kind: "review", meta, parsed: withMetaBalances(parsed, meta) })
          }}
        />
      )}

      {step.kind === "review" && (
        <ReviewStep
          wallet={(wallets.data ?? []).find((w) => w.id === step.wallet.id) ?? step.wallet}
          file={step.file}
          parsed={step.parsed}
          meta={step.meta}
          onBack={() => setStep({ ...step, kind: "map" })}
          onDone={(result) => setStep({ kind: "done", wallet: step.wallet, result })}
        />
      )}

      {step.kind === "done" && (
        <Card className="items-center gap-3 px-6 py-8 text-center">
          <CircleCheckIcon className="size-12 text-emerald-500" aria-hidden />
          <p className="text-lg font-semibold">{t("recon.doneTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("recon.doneSummary", { matched: step.result.matched, created: step.result.created, skipped: step.result.skipped })}
          </p>
          <div className="grid w-full grid-cols-2 gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep({ kind: "upload" })}>
              {t("recon.another")}
            </Button>
            <Button asChild>
              <Link href="/wallets">{t("recon.backToWallets")}</Link>
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
