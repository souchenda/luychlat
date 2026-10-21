"use client";

import Link from "next/link";
import { useState } from "react";

import { BottomSheet } from "@/components/common/bottom-sheet";
import { Amount } from "@/components/money/amount";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cbcVerdict, GRADE_BADGE, gradeBadge, type CbcAssessment } from "@/lib/cbc-engine";
import { useActiveWorkspace } from "@/lib/data/hooks";
import { CBC_CODES, CBC_ESTIMATE_NOTE, type CbcTier } from "@/lib/loans/cbc";
import { useCbcAssessment } from "@/lib/loans/use-cbc-assessment";
import { cn } from "@/lib/utils";

export const TIER_TONE: Record<CbcTier | "unknown", string> = {
  good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
  bad: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  unknown: "bg-muted text-muted-foreground",
};

/**
 * Each strip code's own colour (founder, 21/10/2026): 0 green, 1 yellow, 2 orange, 3+ red, C blue, Q soft green, X / ✓ /
 * «…» muted — the meaning stays CBC's (lib/loans/cbc.ts), the colour only makes a late month easy to see.
 */
export const CODE_TONE: Record<string, string> = {
  "0": "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200",
  Q: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "1": "bg-yellow-400/30 text-yellow-900 dark:text-yellow-200",
  "2": "bg-orange-500/25 text-orange-900 dark:text-orange-200",
  "3+": "bg-rose-600/25 text-rose-900 dark:text-rose-200",
  C: "bg-sky-500/20 text-sky-900 dark:text-sky-200",
  X: "bg-muted/60 text-muted-foreground/70",
  "✓": "bg-muted text-muted-foreground",
  "…": "border border-dashed text-muted-foreground",
};

/** The strip's colours, in plain words. */
export const STRIP_LEGEND: { code: string; km: string }[] = [
  { code: "0", km: "បង់ទាន់ពេល" },
  { code: "1", km: "យឺត 1–29 ថ្ងៃ" },
  { code: "2", km: "យឺត 30–59 ថ្ងៃ" },
  { code: "3+", km: "យឺត 60 ថ្ងៃឡើងទៅ" },
  { code: "C", km: "បង់ផ្តាច់រួច" },
  { code: "Q", km: "គ្មានការបង់ក្នុងខែនោះ" },
  { code: "X", km: "មុនពេលខ្ចី" },
  { code: "✓", km: "បានបង់ តែគ្មានថ្ងៃបង់កត់ត្រា" },
];

const GROUPS: { tier: CbcTier; title: string }[] = [
  { tier: "good", title: "🟢 ល្អ" },
  { tier: "warn", title: "🟡 ត្រូវប្រុងប្រយ័ត្ន" },
  { tier: "bad", title: "🔴 គ្រោះថ្នាក់" },
];

/**
 * «🛡️ សុខភាពឥណទាន CBC» (founder, 21/10/2026 — replaces the 20/10 code guide): what the Credit Bureau Cambodia is, why a
 * bank reads it before a loan, the strip's colours, every code (the founder's 20/10 table, unchanged), and how a
 * history turns green again — the last 24 cycles roll. Always in Khmer; an estimate, never the official report.
 */
export function CbcHealthModal({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-10 gap-1.5 text-xs", className)}
        onClick={() => setOpen(true)}
      >
        🛡️ សុខភាពឥណទាន CBC
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="🛡️ សុខភាពឥណទាន CBC"
        description="ប្រវត្តិសងប្រាក់ 24 ខែ — អ្វីដែលធនាគារមើល មុនពេលផ្តល់កម្ចីឱ្យលោកអ្នក។"
      >
        {/* The person's own assessment first (founder, 21/10/2026), the code dictionary below as the legend. */}
        {open && <CbcAssessmentSection />}
        <CbcHealthContent />
      </BottomSheet>
    </>
  );
}

/** The badge's colours, by grade. */
const GRADE_TONE = {
  good: "bg-emerald-500/15 text-emerald-800 ring-emerald-500/30 dark:text-emerald-200",
  fine: "bg-yellow-400/20 text-yellow-900 ring-yellow-500/30 dark:text-yellow-100",
  warn: "bg-orange-500/20 text-orange-900 ring-orange-500/30 dark:text-orange-100",
  bad: "bg-rose-500/15 text-rose-800 ring-rose-500/30 dark:text-rose-200",
} as const;

/** The active workspace's assessment, loaded when the sheet opens. */
function CbcAssessmentSection() {
  const { workspace } = useActiveWorkspace();
  const { assessment, unscheduled } = useCbcAssessment(workspace?.id, true);
  if (!assessment)
    return (
      <div className="mb-5 space-y-2" aria-busy>
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    );
  return <CbcAssessmentView a={assessment} unscheduled={unscheduled} />;
}

/**
 * The real assessment (founder, 21/10/2026 — lib/cbc-engine): the grade badge, the on-time rate and the DTI, every loan's
 * 24 months together, the bank's verdict with the way back to green, and what it is based on. Pure view (tested alone).
 */
export function CbcAssessmentView({ a, unscheduled = 0 }: { a: CbcAssessment; unscheduled?: number }) {
  if (a.loans === 0)
    return (
      <p className="mb-5 rounded-2xl bg-muted p-4 text-sm" data-testid="cbc-assessment">
        មិនទាន់មានកម្ចីដែលមានតារាងបង់ក្នុងអេបនៅឡើយ — បន្ថែមកម្ចីជាមួយតារាងបង់ ដើម្បីទទួលការវាយតម្លៃសុខភាពឥណទាន។
      </p>
    );
  const verdict = cbcVerdict(a);
  return (
    <section className="mb-6 space-y-3" data-testid="cbc-assessment">
      {a.grade ? (
        <p className={cn("rounded-2xl px-4 py-3 text-center text-base font-bold ring-1", GRADE_TONE[GRADE_BADGE[a.grade].tone])}>{gradeBadge(a.grade)}</p>
      ) : (
        <p className="rounded-2xl bg-muted px-4 py-3 text-center text-base font-semibold">⚪ សុខភាពឥណទាន៖ មិនទាន់មានទិន្នន័យគ្រប់គ្រាន់</p>
      )}

      {/* The metrics strip: the on-time rate and the debt-to-income ratio. */}
      <div className="grid grid-cols-2 divide-x rounded-2xl border bg-card py-2.5 text-center tabular-nums">
        <div className="min-w-0 px-2">
          <p className="text-xs text-muted-foreground">អត្រាសងទៀងទាត់</p>
          <p className="text-lg font-bold">{a.rate === null ? "—" : `${a.rate}%`}</p>
          <p className="text-[11px] text-muted-foreground">{a.counted ? `${a.onTime}/${a.counted} ខែ` : "មិនទាន់មានថ្ងៃបង់កត់ត្រា"}</p>
        </div>
        <div className="min-w-0 px-2">
          <p className="text-xs text-muted-foreground">បន្ទុកបំណុល (DTI)</p>
          <p className="text-lg font-bold">{a.dti === null ? "—" : `${a.dti}%`}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {a.monthlyIncomeUsd === null ? (
              "គ្មានចំណូលកត់ត្រា 3 ខែចុងក្រោយ"
            ) : (
              <>
                <Amount value={a.monthlyDebtUsd} currency="USD" /> ÷ <Amount value={a.monthlyIncomeUsd} currency="USD" /> ក្នុង 1 ខែ
              </>
            )}
          </p>
        </div>
      </div>

      {/* Every loan's 24 months together: the worst code due each month. */}
      <ol className="grid grid-cols-12 gap-1" aria-label="ប្រវត្តិសងប្រាក់ 24 ខែ — កម្ចីទាំងអស់">
        {a.months.map((m) => (
          <li key={m.month} title={`${m.label} · ${m.code}`} className={cn("grid h-6 place-items-center rounded font-mono text-[10px] font-semibold", CODE_TONE[m.code] ?? CODE_TONE["✓"])}>
            {m.code}
          </li>
        ))}
      </ol>
      {a.streak > 0 && <p className="text-xs text-muted-foreground">✅ បង់ទាន់ពេលជាប់គ្នា {a.streak} ខែចុងក្រោយ</p>}

      <div className="space-y-1.5 rounded-2xl bg-emerald-500/10 p-3.5">
        <h3 className="font-semibold">🏦 សេចក្តីសន្និដ្ឋានរបស់ធនាគារ</h3>
        {verdict.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      {/* The one-page statement to print or share before meeting a loan officer (founder, 21/10/2026). */}
      <Link
        href="/debts/statement"
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-600/25 bg-emerald-600 px-4 py-2.5 font-semibold text-white shadow-sm transition-transform active:scale-[0.98]"
      >
        📄 ទាញយករបាយការណ៍បឋម (PDF / Print)
      </Link>

      <p className="text-[11px] text-muted-foreground">
        ℹ️ វាយតម្លៃពីកម្ចី {a.loans} ដែលកត់ក្នុង អេប លុយឆ្លាត
        {unscheduled > 0 && ` (កម្ចី ${unscheduled} គ្មានតារាងបង់ មិនបានរាប់)`}
        {a.unknownPaid > 0 && ` · ${a.unknownPaid} ខែបានបង់ តែគ្មានថ្ងៃបង់កត់ត្រា មិនបានរាប់`} — កម្ចីនៅកន្លែងផ្សេង មិនមាននៅទីនេះទេ។ {CBC_ESTIMATE_NOTE}
      </p>
      <h3 className="pt-2 text-xs font-semibold tracking-wide text-muted-foreground">📖 ឯកសារយោង៖ កូដ CBC</h3>
    </section>
  );
}

/** The explainer itself — what CBC is, the colours, the codes, the 24-month tip (rendered in the sheet; tested alone). */
export function CbcHealthContent() {
  return (
    <div
      className="space-y-5 text-sm leading-relaxed"
      data-testid="cbc-health-modal"
    >
      <section className="space-y-1.5">
        <h3 className="font-semibold">CBC ជាអ្វី?</h3>
        <p>
          ការិយាល័យឥណទានកម្ពុជា (Credit Bureau Cambodia — CBC)
          ទទួលរបាយការណ៍ពីធនាគារ
          និងគ្រឹះស្ថានមីក្រូហិរញ្ញវត្ថុដែលមានអាជ្ញាប័ណ្ណរៀងរាល់ខែ
          ថាតើលោកអ្នកសងប្រាក់ទាន់ពេល ឬយឺតប៉ុន្មានថ្ងៃ។
        </p>
        <p>
          មុននឹងអនុម័តកម្ចីថ្មី ធនាគារពិនិត្យប្រវត្តិនេះជានិច្ច៖ ប្រវត្តិល្អ
          ធ្វើឱ្យកម្ចីងាយអនុម័ត និងការប្រាក់ទាប — ប្រវត្តិយឺត
          អាចធ្វើឱ្យត្រូវបដិសេធ ឬដំឡើងការប្រាក់។
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">ពណ៌នៅលើតារាង 24 ខែ</h3>
        <ul className="grid grid-cols-2 gap-1.5">
          {STRIP_LEGEND.map((l) => (
            <li key={l.code} className="flex items-center gap-2">
              <span
                className={cn(
                  "grid h-7 min-w-9 shrink-0 place-items-center rounded-md px-1.5 font-mono text-xs font-semibold",
                  CODE_TONE[l.code],
                )}
              >
                {l.code}
              </span>
              <span className="text-xs">{l.km}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">វចនានុក្រមកូដ CBC</h3>
        {GROUPS.map((g) => (
          <div key={g.tier} className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">
              {g.title}
            </p>
            <ul className="space-y-1.5">
              {CBC_CODES.filter((c) => c.tier === g.tier).map((c) => (
                <li key={c.code} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid h-8 min-w-12 shrink-0 place-items-center rounded-lg px-2 font-mono text-sm font-semibold",
                      TIER_TONE[c.tier],
                    )}
                  >
                    {c.code}
                  </span>
                  <span>{c.km}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="space-y-1.5 rounded-xl bg-emerald-500/10 p-3">
        <h3 className="font-semibold">
          💡 របៀបធ្វើឱ្យប្រវត្តិត្រឡប់មកពណ៌បៃតងវិញ
        </h3>
        <p>
          CBC បង្ហាញតែ 24 វដ្តចុងក្រោយ (ប្រហែល 2 ឆ្នាំ) — រៀងរាល់ខែ
          ខែចាស់បំផុតរំកិលចេញ។ បើលោកអ្នកបង់ទាន់ពេលជាប់គ្នា 24 ខែ
          ការសងយឺតពីមុននឹងរំកិលចេញពីប្រវត្តិ
          ហើយតារាងនឹងក្លាយជាពណ៌បៃតងទាំងអស់វិញ។
        </p>
        <p>
          ការសងយឺតសូម្បីតែ 1 ថ្ងៃ អាចបង្ហាញជាកូដ [1] — ចុច «បង់»
          ក្នុងអេបនៅថ្ងៃបង់ ដើម្បីកត់ត្រាថ្ងៃពិតប្រាកដ។
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        ℹ️ {CBC_ESTIMATE_NOTE} សូមពិនិត្យរបាយការណ៍ផ្លូវការជាមួយ CBC
        ឬធនាគាររបស់លោកអ្នក។
      </p>
    </div>
  );
}
