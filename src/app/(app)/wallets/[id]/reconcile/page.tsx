"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { ArrowLeftIcon, CircleCheckIcon, CrownIcon, FileUpIcon, Loader2Icon, LockIcon, ScaleIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { MappingStep } from "@/components/reconcile/mapping-step"
import { ReviewStep } from "@/components/reconcile/review-step"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useActiveWorkspace, useWallets } from "@/lib/data/hooks"
import type { Wallet } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { formatMoney } from "@/lib/money"
import { showUpgrade, usePlan } from "@/lib/plan"
import { deleteImport, isFileImported, listImports, type ImportResult } from "@/lib/reconcile/api"
import { readStatementFile, StatementFileError, type StatementFile } from "@/lib/reconcile/file"
import { loadMapping, saveMapping } from "@/lib/reconcile/memory"
import { guessMapping, type Mapping, type ParseResult } from "@/lib/reconcile/parse"

type Step =
  | { kind: "upload" }
  | { kind: "map"; file: StatementFile; mapping: Mapping }
  | { kind: "review"; file: StatementFile; mapping: Mapping; parsed: ParseResult }
  | { kind: "done"; result: ImportResult }

const fmt = (ymd: string) => format(new Date(`${ymd}T00:00:00`), "dd/MM/yyyy")

function ImportHistory({ wallet }: { wallet: Wallet }) {
  const t = useT()
  const queryClient = useQueryClient()
  const imports = useQuery({ queryKey: ["statement-imports", wallet.id], queryFn: () => listImports(wallet.id) })
  const undo = useMutation({
    mutationFn: deleteImport,
    onSuccess: () => {
      toast.success(t("recon.undone"))
      for (const key of ["statement-imports", "transactions"]) void queryClient.invalidateQueries({ queryKey: [key] })
    },
    onError: () => toast.error(t("common.error")),
  })
  if (!imports.data?.length) return null
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{t("recon.history")}</h2>
      <Card className="gap-0 divide-y py-0">
        {imports.data.map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium tabular-nums">
                {fmt(i.period_start)} – {fmt(i.period_end)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("recon.historyLine", { lines: i.line_count, date: format(new Date(i.created_at), "dd/MM HH:mm") })}
              </p>
            </div>
            {i.closing_balance !== null && <span className="text-sm tabular-nums">{formatMoney(i.closing_balance, wallet.currency)}</span>}
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-muted-foreground"
              aria-label={t("recon.undoImport")}
              disabled={undo.isPending}
              onClick={() => window.confirm(t("recon.undoConfirm")) && undo.mutate(i.id)}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        ))}
      </Card>
    </section>
  )
}

export default function ReconcileStatementPage() {
  const t = useT()
  const { id } = useParams<{ id: string }>()
  const { workspace } = useActiveWorkspace()
  const wallets = useWallets(workspace?.id)
  const wallet = wallets.data?.find((w) => w.id === id)
  const { isPro, loading } = usePlan()
  const [step, setStep] = useState<Step>({ kind: "upload" })
  const [reading, setReading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pick = async (picked: File | undefined) => {
    if (!picked || !wallet) return
    setReading(true)
    try {
      const file = await readStatementFile(picked)
      // Early, friendly duplicate check; the database refuses duplicates anyway.
      const imported = await isFileImported(wallet.id, file.sha256).catch(() => false)
      if (imported) {
        toast.error(t("recon.error.already_imported"))
        return
      }
      const mapping = loadMapping(wallet.id, file.rows) ?? guessMapping(file.rows) ?? { headerRow: 0, roles: [], dateOrder: "DMY" as const }
      setStep({ kind: "map", file, mapping })
    } catch (error) {
      toast.error(error instanceof StatementFileError ? t(`recon.file.${error.code}`) : t("common.error"))
    } finally {
      setReading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  if (wallets.isLoading || loading) return <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
  if (!wallet) {
    return (
      <Card className="items-center gap-3 px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">{t("recon.walletMissing")}</p>
        <Button asChild variant="outline">
          <Link href="/wallets">{t("common.back")}</Link>
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/wallets">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{t("recon.title")}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {wallet.name} · {formatMoney(wallet.balance, wallet.currency)}
            {wallet.last_reconciled_on && ` · ${t("recon.lastReconciled", { date: fmt(wallet.last_reconciled_on) })}`}
          </p>
        </div>
      </div>

      {!isPro ? (
        <Card className="items-center gap-3 px-6 py-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ScaleIcon className="size-6" aria-hidden />
          </span>
          <p className="font-semibold">{t("recon.proTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("recon.intro")}</p>
          <Button onClick={() => showUpgrade("reconcile")}>
            <CrownIcon />
            {t("upgrade.cta")}
          </Button>
        </Card>
      ) : step.kind === "upload" ? (
        <>
          <Card className="gap-4 px-5 py-6">
            <p className="text-sm text-muted-foreground">{t("recon.intro")}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>{t("recon.step1")}</li>
              <li>{t("recon.step2")}</li>
              <li>{t("recon.step3")}</li>
            </ol>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={(e) => pick(e.target.files?.[0])}
              aria-label={t("recon.chooseFile")}
            />
            <Button className="h-12 text-base" onClick={() => inputRef.current?.click()} disabled={reading}>
              {reading ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />}
              {t("recon.chooseFile")}
            </Button>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t("recon.privacy")}
            </p>
          </Card>
          <ImportHistory wallet={wallet} />
        </>
      ) : step.kind === "map" ? (
        <MappingStep
          file={step.file}
          mapping={step.mapping}
          currency={wallet.currency}
          onMappingChange={(mapping) => setStep({ ...step, mapping })}
          onBack={() => setStep({ kind: "upload" })}
          onContinue={(parsed) => {
            saveMapping(wallet.id, step.file.rows, step.mapping)
            setStep({ kind: "review", file: step.file, mapping: step.mapping, parsed })
          }}
        />
      ) : step.kind === "review" ? (
        <ReviewStep
          wallet={wallet}
          file={step.file}
          parsed={step.parsed}
          onBack={() => setStep({ kind: "map", file: step.file, mapping: step.mapping })}
          onDone={(result) => setStep({ kind: "done", result })}
        />
      ) : (
        <Card className="items-center gap-3 px-6 py-8 text-center">
          <CircleCheckIcon className="size-12 text-[#10B981]" aria-hidden />
          <p className="text-lg font-semibold">{t("recon.doneTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("recon.doneSummary", { matched: step.result.matched, created: step.result.created, skipped: step.result.skipped })}
          </p>
          {step.result.adjusted !== 0 && (
            <p className="text-sm">{t("recon.doneAdjusted", { amount: formatMoney(Number(step.result.adjusted), wallet.currency, { signed: true }) })}</p>
          )}
          {step.result.difference !== 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {t("recon.doneDifference", { amount: formatMoney(Number(step.result.difference), wallet.currency, { signed: true }) })}
            </p>
          )}
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
