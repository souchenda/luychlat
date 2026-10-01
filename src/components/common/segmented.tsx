"use client"

import { cn } from "@/lib/utils"

/** Small segmented control (e.g. USD / KHR). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: React.ReactNode }[]
  disabled?: boolean
  "aria-label"?: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            value === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
