import { addDays, endOfMonth, format, parseISO, startOfMonth, startOfQuarter, startOfYear, subMonths } from "date-fns"

export type RangePreset = "thisMonth" | "lastMonth" | "thisQuarter" | "ytd" | "custom"

/** Inclusive local calendar dates (yyyy-MM-dd). */
export type DateRange = { from: string; to: string }

const fmt = (d: Date) => format(d, "yyyy-MM-dd")

export function presetRange(preset: Exclude<RangePreset, "custom">, today = new Date()): DateRange {
  switch (preset) {
    case "thisMonth":
      return { from: fmt(startOfMonth(today)), to: fmt(today) }
    case "lastMonth": {
      const last = subMonths(today, 1)
      return { from: fmt(startOfMonth(last)), to: fmt(endOfMonth(last)) }
    }
    case "thisQuarter":
      return { from: fmt(startOfQuarter(today)), to: fmt(today) }
    case "ytd":
      return { from: fmt(startOfYear(today)), to: fmt(today) }
  }
}

/** ISO bounds [from, to) for transaction filters: local midnight to the day after `to`. */
export function rangeToFilter(range: DateRange): { from: string; to: string } {
  return {
    from: parseISO(range.from).toISOString(),
    to: addDays(parseISO(range.to), 1).toISOString(),
  }
}

export function formatRange(range: DateRange): string {
  return `${format(parseISO(range.from), "dd/MM/yyyy")} – ${format(parseISO(range.to), "dd/MM/yyyy")}`
}
