"use client"

import { ArrowLeftIcon, PrinterIcon, Share2Icon } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatementPaper } from "@/components/loans/statement-paper"
import { buildStatement, STATEMENT_TITLE, statementShareText } from "@/lib/credit-statement"
import { useActiveWorkspace, useProfile } from "@/lib/data/hooks"
import { todayDate } from "@/lib/debts"
import { useCbcAssessment } from "@/lib/loans/use-cbc-assessment"

/**
 * The pre-loan assessment statement (founder, 21/10/2026 — lib/credit-statement): one dignified page to print, save as
 * PDF or share before meeting a loan officer, so nobody has to pull an official CBC report to start the conversation.
 * Its figures are shown in full (the person opened it to hand over); the soft-check disclaimer and what the data is are
 * on the page itself.
 */
export default function CreditStatementPage() {
  const { workspace } = useActiveWorkspace()
  const profile = useProfile().data
  const { assessment } = useCbcAssessment(workspace?.id, true)

  if (!assessment)
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[32rem] w-full rounded-2xl" />
      </div>
    )

  const s = buildStatement(assessment, { name: profile?.display_name?.trim() || "—", workspace: workspace?.name ?? "—", today: todayDate() })
  const share = async () => {
    const text = statementShareText(s)
    try {
      if (navigator.share) await navigator.share({ title: STATEMENT_TITLE, text })
      else {
        await navigator.clipboard.writeText(text)
        toast.success("បានចម្លងរបាយការណ៍ — បិទភ្ជាប់ទៅក្នុង Telegram ឬ Messenger")
      }
    } catch {
      // The person closed the share sheet.
    }
  }

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="flex items-center gap-2 print:hidden">
        <Button asChild size="icon" variant="ghost" aria-label="ត្រឡប់ក្រោយ">
          <Link href="/debts?tab=PAYABLE">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">របាយការណ៍បឋម</h1>
        <Button size="sm" variant="outline" onClick={share}>
          <Share2Icon />
          ចែករំលែក
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <PrinterIcon />
          PDF / Print
        </Button>
      </div>

      <StatementPaper s={s} dti={assessment.dti} />
    </div>
  )
}
