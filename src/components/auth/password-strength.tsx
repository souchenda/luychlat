"use client"

import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

export const MIN_PASSWORD = 8
/** Sign-up and reset require at least "fair". */
export const MIN_STRENGTH = 2

// Very common choices (and the app's own name) that a length rule alone would allow.
const COMMON = ["password", "12345678", "123456789", "qwerty", "11111111", "abc12345", "iloveyou", "luysmart", "luychlat", "khmer", "cambodia", "phnompenh"]

/** 0 = too weak … 4 = strong. */
export function passwordStrength(password: string, email = ""): number {
  if (password.length < MIN_PASSWORD) return 0
  const lower = password.toLowerCase()
  // Any 5 letters in a row from the email name (e.g. "chenda" in souchenda22@…) make it guessable.
  const local = (email.split("@")[0] ?? "").toLowerCase().replace(/[^a-z]/g, "")
  const fromEmail = Array.from({ length: Math.max(0, local.length - 4) }, (_, i) => local.slice(i, i + 5))
  if (COMMON.some((c) => lower.includes(c)) || fromEmail.some((part) => lower.includes(part))) return 1
  if (/^(.)\1+$/.test(password) || /^\d+$/.test(password)) return 1
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  let score = kinds >= 3 ? 2 : 1
  if (password.length >= 12 && kinds >= 2) score++
  if (password.length >= 16 || (password.length >= 12 && kinds === 4)) score++
  return Math.min(4, score)
}

const LEVELS: { key: MessageKey; bar: string }[] = [
  { key: "pw.tooShort", bar: "bg-muted-foreground/40" },
  { key: "pw.weak", bar: "bg-red-500" },
  { key: "pw.fair", bar: "bg-amber-500" },
  { key: "pw.good", bar: "bg-lime-500" },
  { key: "pw.strong", bar: "bg-emerald-500" },
]

/** Four bars plus a label; the label carries the meaning, not just the colour. */
export function PasswordStrength({ password, email }: { password: string; email?: string }) {
  const t = useT()
  if (!password) return <p className="text-xs text-muted-foreground">{t("login.passwordHint", { min: MIN_PASSWORD })}</p>
  const score = passwordStrength(password, email)
  const level = LEVELS[score]
  return (
    <div className="space-y-1" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= score ? level.bar : "bg-muted")} />
        ))}
      </div>
      <p className={cn("text-xs", score < MIN_STRENGTH ? "text-destructive" : "text-muted-foreground")}>
        {t(level.key, { min: MIN_PASSWORD })}
        {score < MIN_STRENGTH && score > 0 && ` ${t("pw.tip")}`}
      </p>
    </div>
  )
}
