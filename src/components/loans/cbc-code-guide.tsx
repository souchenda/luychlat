"use client"

import { InfoIcon } from "lucide-react"
import { useState } from "react"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Button } from "@/components/ui/button"
import { CBC_CODES, type CbcTier } from "@/lib/loans/cbc"
import { cn } from "@/lib/utils"

export const TIER_TONE: Record<CbcTier | "unknown", string> = {
  good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  bad: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  unknown: "bg-muted text-muted-foreground",
}

const GROUPS: { tier: CbcTier; title: string }[] = [
  { tier: "good", title: "🟢 ល្អ" },
  { tier: "warn", title: "🟡 ត្រូវប្រុងប្រយ័ត្ន" },
  { tier: "bad", title: "🔴 គ្រោះថ្នាក់" },
]

/**
 * «ℹ️ ស្វែងយល់ពីកូដ CBC» (founder, 20/10/2026): what the Credit Bureau Cambodia's 24-month repayment codes mean,
 * by colour — so nobody hurts their bank credit without knowing it (lib/loans/cbc.ts). Always in Khmer.
 */
export function CbcCodeGuide({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className={cn("h-10 gap-1.5 text-xs", className)} onClick={() => setOpen(true)}>
        <InfoIcon className="size-4" aria-hidden />
        ស្វែងយល់ពីកូដ CBC
      </Button>
      <BottomSheet open={open} onOpenChange={setOpen} title="កូដប្រវត្តិសងប្រាក់ ២៤ ខែ (CBC)" description="ការិយាល័យឥណទានកម្ពុជា (Credit Bureau Cambodia) កត់ត្រារបៀបសងប្រាក់ប្រចាំខែរបស់អ្នក ២៤ ខែចុងក្រោយ — ធនាគារពិនិត្យវាមុននឹងផ្ដល់កម្ចីថ្មី។">
        <div className="space-y-4" data-testid="cbc-guide">
          {GROUPS.map((g) => (
            <section key={g.tier} className="space-y-1.5">
              <h3 className="text-sm font-semibold">{g.title}</h3>
              <ul className="space-y-1.5">
                {CBC_CODES.filter((c) => c.tier === g.tier).map((c) => (
                  <li key={c.code} className="flex items-center gap-3 text-sm">
                    <span className={cn("grid h-8 min-w-12 shrink-0 place-items-center rounded-lg px-2 font-mono text-sm font-semibold", TIER_TONE[c.tier])}>{c.code}</span>
                    <span>{c.km}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
            💡 បង់ទាន់ពេលរាល់ខែ ដើម្បីរក្សាកូដ [0] — ការសងយឺតសូម្បីតែ ១ ថ្ងៃ អាចបង្ហាញជាកូដ [1] ក្នុងប្រវត្តិរបស់អ្នក។ សូមពិនិត្យរបាយការណ៍ផ្លូវការជាមួយ CBC ឬធនាគាររបស់អ្នក។
          </p>
        </div>
      </BottomSheet>
    </>
  )
}
