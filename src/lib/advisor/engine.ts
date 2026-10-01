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
export type Intent = "debt_first" | "month_status" | "shortfall" | "save_tips" | "health" | "improve_score"

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
export function detectIntent(text: string): Intent {
  const q = text.toLowerCase()
  if (/(ពិន្ទុ|ឥណទាន|score|credit|fico)/.test(q)) return "improve_score"
  if (/(បំណុល|សង|debt|loan|owe|snowball|avalanche|pay off)/.test(q)) return "debt_first"
  if (/(ខ្វះ|សាច់ប្រាក់|cash|short|liquid|30)/.test(q)) return "shortfall"
  if (/(សន្សំ|កាត់បន្ថយ|save|saving|cut|reduce)/.test(q)) return "save_tips"
  if (/(ខែនេះ|ស្ថានភាព|month|status|how am i)/.test(q)) return "month_status"
  return "health"
}

export function answer(intent: Intent, s: Snapshot, labels: SnapshotLabels, lang: Lang): string {
  switch (intent) {
    case "debt_first": {
      const strategy = compareStrategies(s)
      if (!strategy) return L(lang, "អ្នកមិនមានបំណុលត្រូវសងទេ។ សូមពិចារណាដាក់សន្សំជាប្រាក់បម្រុងសម្រាប់ ៣–៦ ខែ។", "You have no payables. Consider building a 3–6 month emergency fund.")
      const plan = strategy[strategy.recommended]
      const order = plan.order.map((ref, i) => `${i + 1}. ${debtName(ref, labels, lang)}`).join("\n")
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
      ].join("\n")
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
        L(lang, "កន្លែងដែលអាចកាត់បន្ថយបាន:", "Where you could cut back:"),
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
        L(lang, `• ចំណូល/ចំណាយមធ្យម: ${usd(s.avgIncome)} / ${usd(s.avgExpense)}`, `• Avg income/expense: ${usd(s.avgIncome)} / ${usd(s.avgExpense)}`),
        L(lang, `• បំណុលត្រូវសង: ${usd(s.payableUsd)} · គេជំពាក់: ${usd(s.receivableUsd)}`, `• Payables: ${usd(s.payableUsd)} · Receivables: ${usd(s.receivableUsd)}`),
        s.dti !== null ? L(lang, `• DTI: ${pct(s.dti)}`, `• DTI: ${pct(s.dti)}`) : "",
        L(lang, "សួរខ្ញុំអំពីបំណុល សាច់ប្រាក់ ឬការសន្សំ!", "Ask me about debts, cash or savings!"),
      ]
        .filter(Boolean)
        .join("\n")
    }
  }
}
