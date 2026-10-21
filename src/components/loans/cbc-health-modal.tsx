"use client";

import { useState } from "react";

import { BottomSheet } from "@/components/common/bottom-sheet";
import { Button } from "@/components/ui/button";
import { CBC_CODES, CBC_ESTIMATE_NOTE, type CbcTier } from "@/lib/loans/cbc";
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
  { code: "1", km: "យឺត ១–២៩ ថ្ងៃ" },
  { code: "2", km: "យឺត ៣០–៥៩ ថ្ងៃ" },
  { code: "3+", km: "យឺត ៦០ ថ្ងៃឡើងទៅ" },
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
        description="ប្រវត្តិសងប្រាក់ ២៤ ខែ — អ្វីដែលធនាគារមើល មុនពេលផ្តល់កម្ចីឱ្យលោកអ្នក។"
      >
        <CbcHealthContent />
      </BottomSheet>
    </>
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
        <h3 className="font-semibold">ពណ៌នៅលើតារាង ២៤ ខែ</h3>
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
          CBC បង្ហាញតែ ២៤ វដ្តចុងក្រោយ (ប្រហែល ២ ឆ្នាំ) — រៀងរាល់ខែ
          ខែចាស់បំផុតរំកិលចេញ។ បើលោកអ្នកបង់ទាន់ពេលជាប់គ្នា ២៤ ខែ
          ការសងយឺតពីមុននឹងរំកិលចេញពីប្រវត្តិ
          ហើយតារាងនឹងក្លាយជាពណ៌បៃតងទាំងអស់វិញ។
        </p>
        <p>
          ការសងយឺតសូម្បីតែ ១ ថ្ងៃ អាចបង្ហាញជាកូដ [1] — ចុច «បង់»
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
