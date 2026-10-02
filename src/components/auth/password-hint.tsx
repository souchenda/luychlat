"use client"

import { CheckIcon } from "lucide-react"

import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

/**
 * Passwords: any characters, at least 6 (Supabase's default minimum). No
 * strength meter or character-class rules: friction costs more sign-ups than
 * it saves, and the PIN lock protects the app on the device.
 */
export const MIN_PASSWORD = 6

/** A quiet "at least 6 characters" line that turns green once met. */
export function PasswordHint({ password }: { password: string }) {
  const t = useT()
  const ok = password.length >= MIN_PASSWORD
  return (
    <p className={cn("flex items-center gap-1.5 text-xs", ok ? "text-[#10B981]" : "text-muted-foreground")} aria-live="polite">
      {ok && <CheckIcon className="size-3.5" aria-hidden />}
      {t("pw.tooShort", { min: MIN_PASSWORD })}
    </p>
  )
}
