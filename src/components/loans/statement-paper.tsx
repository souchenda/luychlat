import { DATA_NOTE, SOFT_CHECK_DISCLAIMER, STATEMENT_SUBTITLE, STATEMENT_TITLE, type DtiBand, type Statement } from "@/lib/credit-statement"
import { cn } from "@/lib/utils"

/** The matrix on paper: light colours only (the sheet is white in dark mode too), printed as they are. */
const PAPER_TONE: Record<string, string> = {
  "0": "bg-emerald-100 text-emerald-800",
  Q: "bg-emerald-50 text-emerald-700",
  "1": "bg-yellow-100 text-yellow-900",
  "2": "bg-orange-100 text-orange-900",
  "3+": "bg-rose-100 text-rose-900",
  C: "bg-sky-100 text-sky-900",
  X: "bg-slate-50 text-slate-400",
  "✓": "bg-slate-100 text-slate-600",
  "…": "border border-dashed border-slate-300 text-slate-500",
}
const BAND_TONE: Record<DtiBand, string> = { safe: "bg-emerald-500", watch: "bg-amber-500", high: "bg-rose-500" }
const GRADE_TONE: Record<string, string> = { A: "text-emerald-700", B: "text-yellow-700", C: "text-orange-700", D: "text-rose-700" }

/** The statement's page (founder, 21/10/2026): white paper in light and dark mode and in print — tested alone. */
export function StatementPaper({ s, dti }: { s: Statement; dti: number | null }) {
  return (
    <article
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 text-[13px] leading-relaxed text-slate-900 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none"
      style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
      data-testid="credit-statement"
    >
      <header className="border-b-2 border-emerald-700 pb-3">
        <p className="text-[11px] font-semibold tracking-wide text-emerald-700">អេប លុយឆ្លាត · App Luy Chlat</p>
        <h2 className="mt-1 text-base leading-snug font-bold">{STATEMENT_TITLE}</h2>
        <p className="text-xs text-slate-500">{STATEMENT_SUBTITLE}</p>
      </header>

      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3">
        <div className="min-w-0">
          <dt className="text-[11px] text-slate-500">ឈ្មោះ</dt>
          <dd className="truncate font-semibold">{s.name}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-slate-500">គណនី</dt>
          <dd className="truncate font-semibold">{s.workspace}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-slate-500">ថ្ងៃវាយតម្លៃ</dt>
          <dd className="font-semibold tabular-nums">{s.date}</dd>
        </div>
      </dl>

      <section className="space-y-2">
        <h3 className="font-bold text-emerald-800">1. ស្ថានភាពឥណទាន</h3>
        <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 py-3 text-center tabular-nums">
          <div className="px-1">
            <p className="text-[11px] text-slate-500">ចំណាត់ថ្នាក់ (ប៉ាន់ស្មាន)</p>
            <p className={cn("text-xl font-bold", s.grade && GRADE_TONE[s.grade])}>{s.grade ? `Grade ${s.grade}` : "—"}</p>
          </div>
          <div className="px-1">
            <p className="text-[11px] text-slate-500">អត្រាសងទៀងទាត់ 24 ខែ</p>
            <p className="text-xl font-bold">{s.rate}</p>
            <p className="text-[10px] text-slate-500">{s.rateDetail}</p>
          </div>
          <div className="px-1">
            <p className="text-[11px] text-slate-500">កម្ចីកំពុងសង</p>
            <p className="text-xl font-bold">{s.activeLoans}</p>
          </div>
        </div>
        <p className="text-xs text-slate-600">{s.gradeLabel}</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold text-emerald-800">2. លំហូរសាច់ប្រាក់ និងបន្ទុកបំណុល</h3>
        <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 tabular-nums">
          <div className="flex justify-between gap-3 px-3 py-2">
            <dt>ការបង់រំលស់សរុបប្រចាំខែ</dt>
            <dd className="font-semibold whitespace-nowrap">{s.installments}</dd>
          </div>
          <div className="flex justify-between gap-3 px-3 py-2">
            <dt>ចំណូលជាមធ្យមប្រចាំខែ (3 ខែចុងក្រោយ)</dt>
            <dd className="font-semibold whitespace-nowrap">{s.income}</dd>
          </div>
          <div className="space-y-1.5 px-3 py-2">
            <div className="flex justify-between gap-3">
              <dt>បន្ទុកបំណុល (DTI)</dt>
              <dd className="text-right font-semibold">{s.dti}</dd>
            </div>
            {/* The benchmark: a bar to 100% with the 40% safety line. */}
            {dti !== null && s.band && (
              <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <span className={cn("absolute inset-y-0 left-0 rounded-full", BAND_TONE[s.band])} style={{ width: `${Math.min(dti, 100)}%` }} />
                <span className="absolute inset-y-0 left-[40%] w-0.5 bg-slate-700" />
              </div>
            )}
          </div>
        </dl>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold text-emerald-800">3. ប្រវត្តិសងប្រាក់ 24 ខែ</h3>
        <ol className="grid grid-cols-12 gap-1" aria-label="ប្រវត្តិសងប្រាក់ 24 ខែ">
          {s.months.map((m) => (
            <li key={m.month} title={`${m.label} · ${m.code}`} className={cn("grid h-6 place-items-center rounded font-mono text-[10px] font-semibold", PAPER_TONE[m.code] ?? PAPER_TONE["✓"])}>
              {m.code}
            </li>
          ))}
        </ol>
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>{s.months[0]?.label}</span>
          <span>{s.months.at(-1)?.label}</span>
        </div>
        <p className="text-[11px] text-slate-500">0 បង់ទាន់ពេល · 1 យឺត 1–29 ថ្ងៃ · 2 យឺត 30–59 ថ្ងៃ · 3+ យឺត 60 ថ្ងៃឡើងទៅ · Q គ្មានការបង់ក្នុងខែ · C បង់ផ្តាច់ · X មុនពេលខ្ចី</p>
      </section>

      <footer className="space-y-2 border-t border-slate-200 pt-3">
        <p className="rounded-lg bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-900">ℹ️ {SOFT_CHECK_DISCLAIMER}</p>
        <p className="text-[11px] text-slate-500">{DATA_NOTE}</p>
        <p className="text-[11px] text-slate-400">បង្កើតដោយ អេប លុយឆ្លាត · app.luychlat.com</p>
      </footer>
    </article>
  )
}
