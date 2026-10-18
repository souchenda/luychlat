import { formatMoney } from "@/lib/money"

import { scoreGaps, type CreditBand, type ScoreFactor } from "./credit-score"
import type { Snapshot, SnapshotLabels } from "./snapshot"
import { scoreBand } from "./snapshot"
import { compareStrategies } from "./strategy"

/**
 * Offline advisor: rule-based insights and answers computed from the user's
 * real numbers. Used in Guest Mode and whenever no AI key is configured.
 */
export type Lang = "km" | "en"
export type Severity = "good" | "info" | "warn" | "critical"
export type Insight = { id: string; severity: Severity; title: string; body: string }
export type Intent = "debt_first" | "month_status" | "shortfall" | "save_tips" | "health" | "improve_score" | "surplus" | "plan"

const L = (lang: Lang, km: string, en: string) => (lang === "km" ? km : en)
const usd = (n: number) => formatMoney(n, "USD")
const pct = (n: number) => `${Math.round(n * 100)}%`

const BAND: Record<CreditBand, { km: string; en: string }> = {
  excellent: { km: "ល្អឥតខ្ចោះ", en: "Excellent" },
  good: { km: "ល្អបង្គួរ", en: "Good" },
  fair: { km: "មធ្យម", en: "Fair" },
  needs_work: { km: "ត្រូវការកែលម្អ", en: "Needs work" },
}

export const bandLabel = (score: number, lang: Lang) => BAND[scoreBand(score)][lang]

/** One concrete step per weak factor, with the points it could add. */
export function scoreTips(s: Snapshot, labels: SnapshotLabels, lang: Lang): { factor: ScoreFactor; points: number; text: string }[] {
  return scoreGaps(s.scoreFactors).map(({ factor, points }) => {
    let text: string
    if (factor === "repayment") {
      const overdue = s.debts.filter((d) => d.type === "PAYABLE" && d.status === "OVERDUE")
      const names = overdue.map((d) => debtName(d.ref, labels, lang)).join(", ")
      text = L(
        lang,
        `សងបំណុលហួសកំណត់ (${names}) ជាមុនសិន ឬទាក់ទងម្ចាស់បំណុលដើម្បីចរចាកាលវិភាគថ្មី។`,
        `Clear the overdue debt(s) first (${names}), or agree a new schedule with the lender.`,
      )
    } else if (factor === "dti") {
      const excess = s.dti !== null ? Math.max(0, s.monthlyDebtService - 0.36 * s.avgIncome) : s.monthlyDebtService
      text =
        s.dti === null
          ? L(lang, "កត់ត្រាចំណូលប្រចាំខែ ដើម្បីគណនា DTI ហើយជៀសវាងខ្ចីបន្ថែម។", "Record your monthly income so DTI can be measured, and avoid new borrowing.")
          : L(
              lang,
              `បន្ថយ DTI ពី ${pct(s.dti)} មកក្រោម ៣៦%: កាត់បន្ថយការសងបំណុលប្រចាំខែ ~${usd(excess)} (សងបំណុលការប្រាក់ខ្ពស់មុន ឬពន្យារកាលវិភាគ) និងកុំខ្ចីថ្មី។`,
              `Bring DTI from ${pct(s.dti)} below 36%: lower monthly debt payments by ~${usd(excess)} (clear high-interest debt first or extend terms) and avoid new loans.`,
            )
    } else if (factor === "savings") {
      const cut = Math.max(0, s.avgExpense - 0.8 * s.avgIncome)
      const top = s.topExpenses[0]
      text =
        s.savingsRate === null
          ? L(lang, "កត់ត្រាចំណូល ដើម្បីដឹងអត្រាសន្សំ ហើយរក្សាទុកយ៉ាងហោចណាស់ ២០%។", "Record your income to see your savings rate, then keep at least 20% of it.")
          : L(
              lang,
              `បង្កើនអត្រាសន្សំពី ${pct(s.savingsRate)} ទៅ ២០%: កាត់ចំណាយ ~${usd(cut)}/ខែ${top ? ` (ចាប់ផ្តើមពី ${categoryName(top.category, labels)})` : ""}។`,
              `Raise your savings rate from ${pct(s.savingsRate)} to 20%: cut spending by ~${usd(cut)}/month${top ? ` (start with ${categoryName(top.category, labels)})` : ""}.`,
            )
    } else {
      const months = s.avgExpense > 0 ? Math.max(0, s.cashUsd / s.avgExpense) : 0
      const target = 3 * s.avgExpense
      text = L(
        lang,
        `កសាងប្រាក់បម្រុងគ្រាអាសន្ន ៣ ខែ (${usd(target)})។ បច្ចុប្បន្នគ្របដណ្តប់បាន ${months.toFixed(1)} ខែ។`,
        `Build a 3-month emergency fund (${usd(target)}). Your cash covers ${months.toFixed(1)} months today.`,
      )
    }
    return { factor, points, text }
  })
}

function dual(n: number, s: Snapshot) {
  return `${usd(n)} (≈ ${formatMoney(Math.round(n * s.khrPerUsd), "KHR")})`
}

function debtName(ref: string, labels: SnapshotLabels, lang: Lang): string {
  const name = labels.debts[ref]
  return name ? `${name}` : L(lang, `បំណុល ${ref}`, `Debt ${ref}`)
}

function categoryName(key: string, labels: SnapshotLabels) {
  return labels.categories[key] ?? key
}

export function insights(s: Snapshot, labels: SnapshotLabels, lang: Lang): Insight[] {
  const out: Insight[] = []

  // Liquidity first: it's the most urgent.
  if (s.shortfall30 > 0) {
    out.push({
      id: "shortfall",
      severity: "critical",
      title: L(lang, "ហានិភ័យខ្វះសាច់ប្រាក់ ៣០ ថ្ងៃខាងមុខ", "Cash shortfall risk in the next 30 days"),
      body: L(
        lang,
        `បំណុលត្រូវសងក្នុង ៣០ ថ្ងៃ ${dual(s.payablesDue30, s)} ច្រើនជាងសាច់ប្រាក់ដែលរំពឹងទុក ${usd(s.projectedCash30)} ប្រមាណ ${usd(s.shortfall30)}។`,
        `Payables due within 30 days (${dual(s.payablesDue30, s)}) exceed your projected cash (${usd(s.projectedCash30)}) by about ${usd(s.shortfall30)}.`,
      ),
    })
  } else if (s.payablesDue30 > 0) {
    out.push({
      id: "liquidity_ok",
      severity: "good",
      title: L(lang, "សាច់ប្រាក់គ្រប់គ្រាន់សម្រាប់បំណុល ៣០ ថ្ងៃ", "Enough cash for the next 30 days of debts"),
      body: L(
        lang,
        `ត្រូវសង ${usd(s.payablesDue30)} ក្នុង ៣០ ថ្ងៃ ហើយសាច់ប្រាក់រំពឹងទុកមាន ${usd(s.projectedCash30)}។`,
        `${usd(s.payablesDue30)} is due within 30 days and projected cash is ${usd(s.projectedCash30)}.`,
      ),
    })
  }

  if (s.overduePayables > 0) {
    out.push({
      id: "overdue",
      severity: "critical",
      title: L(lang, `មានបំណុលហួសកំណត់ ${s.overduePayables}`, `${s.overduePayables} overdue debt(s)`),
      body: L(lang, "សូមទាក់ទងម្ចាស់បំណុល ដើម្បីចរចាកាលវិភាគសងថ្មី មុនពេលការប្រាក់ ឬពិន័យកើនឡើង។", "Contact the lender to agree a new schedule before interest or penalties grow."),
    })
  }

  if (s.dti !== null) {
    const level: Severity = s.dti > 0.5 ? "critical" : s.dti > 0.36 ? "warn" : "good"
    out.push({
      id: "dti",
      severity: level,
      title: L(lang, `សមាមាត្របំណុលធៀបចំណូល (DTI): ${pct(s.dti)}`, `Debt-to-income ratio: ${pct(s.dti)}`),
      body:
        level === "good"
          ? L(lang, "ស្ថិតក្នុងកម្រិតល្អ (ក្រោម ៣៦%)។", "Healthy (below 36%).")
          : level === "warn"
            ? L(lang, "ខ្ពស់បន្តិច (៣៦–៥០%)។ ជៀសវាងខ្ចីបន្ថែម។", "Getting high (36–50%). Avoid new borrowing.")
            : L(lang, "ខ្ពស់ពេក (លើស ៥០%)។ ផ្តោតលើការសងបំណុលជាអាទិភាព។", "Too high (over 50%). Make debt payoff the priority."),
    })
  }

  if (s.savingsRate !== null) {
    const level: Severity = s.savingsRate < 0 ? "warn" : s.savingsRate < 0.1 ? "info" : "good"
    out.push({
      id: "savings",
      severity: level,
      title: L(lang, `អត្រាសន្សំ: ${pct(s.savingsRate)}`, `Savings rate: ${pct(s.savingsRate)}`),
      body:
        level === "warn"
          ? L(lang, `ចំណាយជាមធ្យម ${usd(s.avgExpense)} លើសចំណូល ${usd(s.avgIncome)}។`, `Average spending ${usd(s.avgExpense)} exceeds income ${usd(s.avgIncome)}.`)
          : level === "info"
            ? L(lang, "គោលដៅល្អគឺសន្សំយ៉ាងហោចណាស់ ១០–២០% នៃចំណូល។", "Aim to save at least 10–20% of income.")
            : L(lang, "ល្អណាស់! បន្តរក្សាទម្លាប់នេះ។", "Great, keep it up!"),
    })
  }

  for (const a of s.anomalies.slice(0, 2)) {
    out.push({
      id: `anomaly_${a.category}`,
      severity: "warn",
      title: L(lang, `ចំណាយមិនប្រក្រតី: ${categoryName(a.category, labels)}`, `Unusual spending: ${categoryName(a.category, labels)}`),
      body: L(
        lang,
        `ខែនេះ ${usd(a.thisMonth)} គឺ ${a.ratio}× នៃមធ្យមភាគ ${usd(a.avgPrevious)}។`,
        `${usd(a.thisMonth)} this month is ${a.ratio}× the usual ${usd(a.avgPrevious)}.`,
      ),
    })
  }

  const strategy = compareStrategies(s)
  if (strategy) {
    const first = strategy[strategy.recommended].order[0]
    out.push({
      id: "strategy",
      severity: "info",
      title: L(
        lang,
        `យុទ្ធសាស្ត្រ ${strategy.recommended === "avalanche" ? "Avalanche" : "Snowball"}`,
        `${strategy.recommended === "avalanche" ? "Avalanche" : "Snowball"} strategy`,
      ),
      body: L(
        lang,
        `សងឱ្យអស់ «${debtName(first, labels, lang)}» មុនគេ។ ${strategy.interestSaved > 0 ? `Avalanche សន្សំការប្រាក់បាន ${usd(strategy.interestSaved)}។` : ""}`,
        `Pay off "${debtName(first, labels, lang)}" first. ${strategy.interestSaved > 0 ? `Avalanche saves ${usd(strategy.interestSaved)} in interest.` : ""}`,
      ).trim(),
    })
  }

  if (!out.length) {
    out.push({
      id: "start",
      severity: "info",
      title: L(lang, "ចាប់ផ្តើមកត់ត្រា", "Start recording"),
      body: L(lang, "កត់ត្រាចំណូល ចំណាយ និងបំណុល ដើម្បីទទួលបានការវិភាគកាន់តែច្បាស់។", "Record income, expenses and debts to get sharper insights."),
    })
  }
  return out
}

/** Maps free text (Khmer or English) to a supported question. */
/**
 * Khmer typed on phones carries invisible zero-width spaces and two ways of writing the same subscript
 * («ផ្តើម» / «ផ្ដើម»): normalise before matching, so a question is never missed for its spelling.
 */
export const normalizeQuestion = (text: string) =>
  text
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/្ដ/g, "្ត") // ្ដ → ្ត
    .toLowerCase()

/**
 * The question's subject, or null when it names none (founder, 18/10/2026 — «តើខ្ញុំគួរចាប់ផ្តើមពីផែនការណា?»
 * and «…ចាត់ចែងបំណុលរបៀបណា?» both got the same generic summary). Order matters: the most specific first.
 */
export function matchIntent(text: string): Intent | null {
  const q = normalizeQuestion(text)
  if (/(ពិន្ទុ|ឥណទាន|score|credit|fico)/.test(q)) return "improve_score"
  if (/(លុយសល់|នៅសល់|សល់ប៉ុន្មាន|សន្សំបានប៉ុន្មាន|left over|leftover|surplus|how much (can|could) i save|how much .*left)/.test(q)) return "surplus"
  if (/(បំណុល|ជំពាក់|កម្ចី|ខ្ចី|រំលស់|ការប្រាក់|សងប្រាក់|សងលុយ|debt|loan|owe|snowball|avalanche|pay off|installment|interest)/.test(q)) return "debt_first"
  if (/(ខ្វះ|សាច់ប្រាក់|cash|short|liquid|៣០ ថ្ងៃ|30 day)/.test(q)) return "shortfall"
  if (/(សន្សំ|កាត់បន្ថយ|save|saving|cut|reduce)/.test(q)) return "save_tips"
  if (/(ផែនការ|ចាប់ផ្តើម|គួរធ្វើអ្វី|ជំហានដំបូង|plan|where (do|should) i (start|begin)|first step)/.test(q)) return "plan"
  if (/(ខែនេះ|ស្ថានភាព|month|status|how am i)/.test(q)) return "month_status"
  return null
}

/** Maps free text (Khmer or English) to a supported question; the overview when it names no subject. */
export function detectIntent(text: string): Intent {
  return matchIntent(text) ?? "health"
}

/**
 * The answer for a question in a conversation (memory): its own subject; else a follow-up («ហេតុអ្វី?»,
 * «ពន្យល់បន្ថែម», "why?") stays on the previous subject; else the overview once, then «what I can answer»
 * — never the same overview block twice.
 */
export function resolveIntent(text: string, previous: Intent | null): Intent | "clarify" {
  const matched = matchIntent(text)
  if (matched) return matched
  if (previous && /(ហេតុអ្វី|ហេតុអី|ម៉េចចឹង|ពន្យល់|លម្អិត|បន្ថែម|ចុះ|why|how so|explain|more|detail|and then)/.test(normalizeQuestion(text))) return previous
  return previous ? "clarify" : "health"
}

/** When a follow-up names no subject and the overview was already given: what I can answer, not the same block again. */
export const clarifyReply = (lang: Lang) =>
  L(
    lang,
    "ខ្ញុំមិនទាន់ច្បាស់ថាអ្នកចង់ដឹងអំពីអ្វីទេ។ អ្នកអាចសួរខ្ញុំអំពី៖\n• ផែនការសងបំណុល (Snowball ឬ Avalanche) — តើគួរសងមួយណាមុន\n• លុយនៅសល់ប៉ុន្មានសម្រាប់សន្សំ\n• ស្ថានភាពខែនេះ\n• ហានិភ័យខ្វះសាច់ប្រាក់ ៣០ ថ្ងៃ\n• វិធីបង្កើនពិន្ទុ",
    "I'm not sure what you'd like to know. You can ask me about:\n• a debt plan (Snowball or Avalanche) — which to pay first\n• how much is left to save each month\n• this month's status\n• the 30-day cash risk\n• how to raise your score",
  )

/** «មធ្យម ២ ខែមុន» / «ខែនេះ» / «ខែនេះ ប៉ាន់ស្មានពេញខែ» — every average says where it comes from. */
function basisLabel(s: Snapshot, kind: "income" | "expense", lang: Lang): string {
  const b = s.basis
  if (kind === "income")
    return b.income === "history" ? L(lang, `មធ្យម ${b.incomeMonths} ខែមុន`, `average of ${b.incomeMonths} previous month${b.incomeMonths === 1 ? "" : "s"}`) : L(lang, "ខែនេះ", "this month")
  return b.expense === "history"
    ? L(lang, `មធ្យម ${b.expenseMonths} ខែមុន`, `average of ${b.expenseMonths} previous month${b.expenseMonths === 1 ? "" : "s"}`)
    : L(lang, "ខែនេះ ប៉ាន់ស្មានពេញខែ", "this month, projected to a full month")
}

/** Income − spending − debt repayments: what is left to save each month (an estimate, stated as one). */
export function monthlySurplus(s: Snapshot): number {
  return Math.round((s.avgIncome - s.avgExpense - s.monthlyDebtService) * 100) / 100
}

export function answer(intent: Intent, s: Snapshot, labels: SnapshotLabels, lang: Lang): string {
  switch (intent) {
    case "plan": {
      // «Which plan should I start with?» — with debts: the repayment plan; without: the savings plan.
      const strategy = compareStrategies(s)
      if (strategy) {
        // An action plan in steps (the full Snowball / Avalanche comparison is the debt answer).
        const payables = s.debts.filter((d) => d.type === "PAYABLE" && d.remainingUsd > 0)
        const smallest = payables.find((d) => d.ref === strategy.snowball.order[0])!
        const rest = strategy.avalanche.order.filter((ref) => ref !== smallest.ref)
        const rate = (ref: string) => payables.find((d) => d.ref === ref)?.annualRatePct ?? 0
        const left = monthlySurplus(s)
        const steps = [
          L(
            lang,
            `សងផ្ដាច់ «${debtName(smallest.ref, labels, lang)}» (${usd(smallest.remainingUsd)}) មុនគេ — បំណុលតូចបំផុត ចប់លឿន ជួយសម្រាលបន្ទុកផ្លូវចិត្ត (Snowball)។`,
            `Clear "${debtName(smallest.ref, labels, lang)}" (${usd(smallest.remainingUsd)}) first — the smallest, done soonest, the biggest relief (Snowball).`,
          ),
          rest.length
            ? L(
                lang,
                `បន្ទាប់មក សងតាមការប្រាក់ខ្ពស់មុន (Avalanche): ${rest.map((ref) => `${debtName(ref, labels, lang)} (${rate(ref)}%/ឆ្នាំ)`).join(" → ")}${strategy.interestSaved > 0 ? ` — សន្សំការប្រាក់បាន ${usd(strategy.interestSaved)}` : ""}។`,
                `Then the highest interest first (Avalanche): ${rest.map((ref) => `${debtName(ref, labels, lang)} (${rate(ref)}%/yr)`).join(" → ")}${strategy.interestSaved > 0 ? ` — saving ${usd(strategy.interestSaved)} in interest` : ""}.`,
              )
            : "",
          L(
            lang,
            `កំណត់ការសង ${usd(strategy.monthlyBudget)}/ខែ នៅថ្ងៃទទួលប្រាក់ខែ ហើយបន្ថែមលើបំណុលបន្ទាប់ រាល់ពេលមួយចប់។`,
            `Set aside ${usd(strategy.monthlyBudget)}/month on payday, and roll it into the next debt each time one is cleared.`,
          ),
          left < 0
            ? L(lang, `ប្រយ័ត្ន៖ ចំណាយ និងការសង លើសចំណូល ${usd(-left)}/ខែ — កាត់បន្ថយចំណាយធំៗ ឬចរចាពន្យារការសងជាមួយធនាគារ។`, `Careful: spending and repayments exceed income by ${usd(-left)}/month — cut the biggest costs or ask the bank for a longer term.`)
            : L(lang, `បន្ទាប់ពីសងរួច ដាក់ ${usd(left)}/ខែ ទៅសន្សំជាប្រាក់បម្រុង។`, `Once repaid, move ${usd(left)}/month into an emergency fund.`),
        ].filter(Boolean)
        return [L(lang, "**ជំហានដំបូង: ផែនការសងបំណុល**", "**First step: a debt plan**"), ...steps.map((step, i) => `${i + 1}. ${step}`)].join("\n")
      }
      return [L(lang, "អ្នកគ្មានបំណុលត្រូវសងទេ — ចាប់ផ្តើមពីផែនការសន្សំ៖", "You have no debts to repay — start with a savings plan:"), answer("surplus", s, labels, lang)].join("\n\n")
    }
    case "surplus": {
      if (s.avgIncome <= 0 && s.avgExpense <= 0)
        return L(lang, "មិនទាន់មានកំណត់ត្រាចំណូល ឬចំណាយគ្រប់គ្រាន់ ដើម្បីគណនាលុយនៅសល់ទេ។ សូមកត់ត្រាចំណូល និងចំណាយរបស់អ្នក។", "There aren't enough income or expense records yet to work out what is left. Record your income and spending first.")
      const left = monthlySurplus(s)
      const target = Math.round(s.avgIncome * 0.2 * 100) / 100
      return [
        L(lang, "លុយនៅសល់សម្រាប់សន្សំប្រចាំខែ (ប៉ាន់ស្មាន)៖", "Left to save each month (estimate):"),
        L(lang, `• ចំណូល: ${usd(s.avgIncome)} (${basisLabel(s, "income", lang)})`, `• Income: ${usd(s.avgIncome)} (${basisLabel(s, "income", lang)})`),
        L(lang, `• ចំណាយ: −${usd(s.avgExpense)} (${basisLabel(s, "expense", lang)})`, `• Spending: −${usd(s.avgExpense)} (${basisLabel(s, "expense", lang)})`),
        s.monthlyDebtService > 0
          ? L(lang, `• សងបំណុល / រំលស់: −${usd(s.monthlyDebtService)}/ខែ (តាមថ្ងៃកំណត់សង)`, `• Debt repayments: −${usd(s.monthlyDebtService)}/month (by their due dates)`)
          : "",
        L(lang, `= **នៅសល់ ${usd(left)}/ខែ**`, `= **${usd(left)} left per month**`),
        left > 0
          ? target > 0
            ? left >= target
              ? L(lang, `ល្អណាស់! អាចដាក់សន្សំ ${usd(target)} (២០% នៃចំណូល) ហើយនៅសល់ ${usd(left - target)} សម្រាប់ប្រាក់បម្រុង។`, `Well done! You can save ${usd(target)} (20% of income) and still keep ${usd(left - target)} spare.`)
              : L(lang, `ដាក់សន្សំ ${usd(left)} ជាមុន ពេលទទួលបានចំណូល។ គោលដៅ ២០% គឺ ${usd(target)} — កាត់បន្ថយចំណាយបន្តិច ដើម្បីទៅដល់។`, `Put ${usd(left)} aside as soon as income arrives. The 20% goal is ${usd(target)} — trim spending a little to reach it.`)
            : ""
          : L(lang, `ចំណាយ និងការសងបំណុល លើសចំណូល ${usd(-left)}/ខែ។ ចាប់ផ្តើមពីកាត់បន្ថយចំណាយធំៗ ឬចរចាពន្យារការសង។`, `Spending and repayments exceed income by ${usd(-left)}/month. Start by cutting the biggest costs or negotiating a longer repayment.`),
      ]
        .filter(Boolean)
        .join("\n")
    }
    case "debt_first": {
      const strategy = compareStrategies(s)
      if (!strategy) return L(lang, "អ្នកមិនមានបំណុលត្រូវសងទេ។ សូមពិចារណាដាក់សន្សំជាប្រាក់បម្រុងសម្រាប់ ៣–៦ ខែ។", "You have no payables. Consider building a 3–6 month emergency fund.")
      const plan = strategy[strategy.recommended]
      const order = plan.order.map((ref, i) => `${i + 1}. ${debtName(ref, labels, lang)}`).join("\n")
      // The quickest win (Snowball's first): the smallest balance — cleared soonest, the biggest relief.
      const smallest = s.debts.find((d) => d.ref === strategy.snowball.order[0])
      const relief =
        smallest && strategy.monthlyBudget > 0
          ? L(
              lang,
              `💡 សម្រាលបន្ទុកផ្លូវចិត្តលឿនបំផុត: សងផ្ដាច់ «${debtName(smallest.ref, labels, lang)}» (${usd(smallest.remainingUsd)}) មុន — ប្រហែល ${Math.max(1, Math.ceil(smallest.remainingUsd / strategy.monthlyBudget))} ខែ ជាមួយ ${usd(strategy.monthlyBudget)}/ខែ។`,
              `💡 Fastest relief: clear "${debtName(smallest.ref, labels, lang)}" (${usd(smallest.remainingUsd)}) first — about ${Math.max(1, Math.ceil(smallest.remainingUsd / strategy.monthlyBudget))} month(s) at ${usd(strategy.monthlyBudget)}/month.`,
            )
          : ""
      const budgetNote = strategy.budgetAssumed
        ? L(lang, `(សន្មតថាសង ${usd(strategy.monthlyBudget)}/ខែ ព្រោះសាច់ប្រាក់សល់ប្រចាំខែមិនគ្រប់គ្រាន់)`, `(assuming ${usd(strategy.monthlyBudget)}/month, since your monthly surplus is too small)`)
        : L(lang, `(ប្រើសាច់ប្រាក់សល់ ${usd(strategy.monthlyBudget)}/ខែ)`, `(using your ${usd(strategy.monthlyBudget)}/month surplus)`)
      return [
        L(lang, `ខ្ញុំណែនាំ **${strategy.recommended === "avalanche" ? "Debt Avalanche" : "Debt Snowball"}** ${budgetNote}:`, `I recommend **${strategy.recommended === "avalanche" ? "Debt Avalanche" : "Debt Snowball"}** ${budgetNote}:`),
        order,
        "",
        L(
          lang,
          `• Snowball (តូចមុន): ${strategy.snowball.months} ខែ, ការប្រាក់ ${usd(strategy.snowball.totalInterest)}\n• Avalanche (ការប្រាក់ខ្ពស់មុន): ${strategy.avalanche.months} ខែ, ការប្រាក់ ${usd(strategy.avalanche.totalInterest)}`,
          `• Snowball (smallest first): ${strategy.snowball.months} months, ${usd(strategy.snowball.totalInterest)} interest\n• Avalanche (highest rate first): ${strategy.avalanche.months} months, ${usd(strategy.avalanche.totalInterest)} interest`,
        ),
        strategy.recommended === "avalanche"
          ? L(lang, `Avalanche សន្សំបាន ${usd(strategy.interestSaved)}។`, `Avalanche saves ${usd(strategy.interestSaved)}.`)
          : L(lang, "ការប្រាក់ស្ទើរតែដូចគ្នា ដូច្នេះ Snowball ផ្តល់ជ័យជម្នះលឿនជាង ដើម្បីរក្សាកម្លាំងចិត្ត។", "Interest is nearly the same, so Snowball's quick wins help you stay motivated."),
        relief,
      ]
        .filter((line, i) => line !== "" || i === 2)
        .join("\n")
    }
    case "month_status": {
      const t = s.thisMonth
      const top = s.topExpenses[0]
      return [
        L(lang, `ខែនេះ (ថ្ងៃទី ${t.daysElapsed}/${t.daysInMonth}):`, `This month (day ${t.daysElapsed}/${t.daysInMonth}):`),
        L(lang, `• ចំណូល: ${dual(t.income, s)}`, `• Income: ${dual(t.income, s)}`),
        L(lang, `• ចំណាយ: ${dual(t.expense, s)}`, `• Expenses: ${dual(t.expense, s)}`),
        L(lang, `• សាច់ប្រាក់សល់: ${usd(t.net)}`, `• Net flow: ${usd(t.net)}`),
        top ? L(lang, `• ចំណាយច្រើនបំផុត: ${categoryName(top.category, labels)} (${pct(top.share)})`, `• Biggest spend: ${categoryName(top.category, labels)} (${pct(top.share)})`) : "",
        s.anomalies[0]
          ? L(lang, `${categoryName(s.anomalies[0].category, labels)} កើនឡើង ${s.anomalies[0].ratio}× ធៀបនឹងធម្មតា។`, `${categoryName(s.anomalies[0].category, labels)} is ${s.anomalies[0].ratio}× higher than usual.`)
          : "",
        L(lang, `ពិន្ទុសុខភាពហិរញ្ញវត្ថុ: ${s.score}/850 (${bandLabel(s.score, lang)})`, `Financial health score: ${s.score}/850 (${bandLabel(s.score, lang)})`),
      ]
        .filter(Boolean)
        .join("\n")
    }
    case "shortfall":
      return [
        L(lang, `សាច់ប្រាក់បច្ចុប្បន្ន: ${dual(s.cashUsd, s)}`, `Current cash: ${dual(s.cashUsd, s)}`),
        L(lang, `• បំណុលត្រូវសងក្នុង ៣០ ថ្ងៃ: ${usd(s.payablesDue30)}`, `• Payables due in 30 days: ${usd(s.payablesDue30)}`),
        L(lang, `• គេជំពាក់ដែលដល់ថ្ងៃក្នុង ៣០ ថ្ងៃ: ${usd(s.receivablesDue30)}`, `• Receivables due in 30 days: ${usd(s.receivablesDue30)}`),
        L(lang, `• សាច់ប្រាក់រំពឹងទុកក្នុង ៣០ ថ្ងៃ: ${usd(s.projectedCash30)}`, `• Projected cash in 30 days: ${usd(s.projectedCash30)}`),
        s.shortfall30 > 0
          ? L(lang, `អាចខ្វះប្រមាណ ${usd(s.shortfall30)}។ ពិចារណា: ប្រមូលប្រាក់គេជំពាក់មុន, កាត់បន្ថយចំណាយមិនចាំបាច់, ឬចរចាពន្យារថ្ងៃសង។`, `Possible shortfall of about ${usd(s.shortfall30)}. Consider collecting receivables early, trimming non-essential spending, or negotiating a later due date.`)
          : L(lang, "មិនមានហានិភ័យខ្វះសាច់ប្រាក់ក្នុង ៣០ ថ្ងៃខាងមុខទេ។", "No cash shortfall expected in the next 30 days."),
      ].join("\n")
    case "save_tips": {
      const tops = s.topExpenses.slice(0, 3)
      if (!tops.length) return L(lang, "មិនទាន់មានចំណាយខែនេះ ដើម្បីវិភាគទេ។", "No expenses this month to analyze yet.")
      const target = Math.round(s.avgIncome * 0.2 * 100) / 100
      return [
        L(lang, "កន្លែងដែលអាចកាត់បន្ថយបាន (ចំណាយខែនេះ):", "Where you could cut back (this month's spending):"),
        ...tops.map((t) =>
          L(lang, `• ${categoryName(t.category, labels)}: ${usd(t.usd)} — កាត់ ១០% សន្សំបាន ${usd(t.usd * 0.1)}`, `• ${categoryName(t.category, labels)}: ${usd(t.usd)} — cutting 10% saves ${usd(t.usd * 0.1)}`),
        ),
        target > 0 ? L(lang, `គោលដៅសន្សំ ២០%: ${usd(target)}/ខែ`, `20% savings target: ${usd(target)}/month`) : "",
      ]
        .filter(Boolean)
        .join("\n")
    }
    case "improve_score": {
      const tips = scoreTips(s, labels, lang)
      if (!tips.length) {
        return L(lang, `ពិន្ទុរបស់អ្នក ${s.score}/850 គឺពេញលេញហើយ! បន្តរក្សាទម្លាប់ល្អនេះ។`, `Your score is ${s.score}/850, already at the top. Keep it up!`)
      }
      return [
        L(lang, `ពិន្ទុបច្ចុប្បន្ន: **${s.score}/850** (${bandLabel(s.score, lang)})។ ជំហានដែលបង្កើនពិន្ទុច្រើនបំផុត:`, `Current score: **${s.score}/850** (${bandLabel(s.score, lang)}). Steps that add the most points:`),
        ...tips.map((tip, i) => `${i + 1}. ${tip.text} **+${tip.points}**`),
      ].join("\n")
    }
    default: {
      return [
        L(lang, `ពិន្ទុសុខភាពហិរញ្ញវត្ថុ: ${s.score}/850 (${bandLabel(s.score, lang)})`, `Financial health: ${s.score}/850 (${bandLabel(s.score, lang)})`),
        L(lang, `• សាច់ប្រាក់: ${dual(s.cashUsd, s)}`, `• Cash: ${dual(s.cashUsd, s)}`),
        L(lang, `• ចំណូល: ${usd(s.avgIncome)}/ខែ (${basisLabel(s, "income", lang)})`, `• Income: ${usd(s.avgIncome)}/month (${basisLabel(s, "income", lang)})`),
        L(lang, `• ចំណាយ: ${usd(s.avgExpense)}/ខែ (${basisLabel(s, "expense", lang)})`, `• Spending: ${usd(s.avgExpense)}/month (${basisLabel(s, "expense", lang)})`),
        L(lang, `• បំណុលត្រូវសង: ${usd(s.payableUsd)} · គេជំពាក់: ${usd(s.receivableUsd)}`, `• Payables: ${usd(s.payableUsd)} · Receivables: ${usd(s.receivableUsd)}`),
        s.dti !== null ? L(lang, `• DTI: ${pct(s.dti)}`, `• DTI: ${pct(s.dti)}`) : "",
        L(lang, "សួរខ្ញុំអំពីបំណុល សាច់ប្រាក់ ឬការសន្សំ!", "Ask me about debts, cash or savings!"),
      ]
        .filter(Boolean)
        .join("\n")
    }
  }
}
