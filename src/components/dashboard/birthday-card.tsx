"use client"

import { CakeIcon, PartyPopperIcon, XIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { useProfile } from "@/lib/data/hooks"
import { useT } from "@/lib/i18n/use-t"
import { isBirthday, useProfilePrivate } from "@/lib/profile-private"

const DISMISS_KEY = "luychlat:birthday-dismissed"

/** Home, on the person's birthday: a warm wish (hidden for the day once closed). */
export function BirthdayCard() {
  const t = useT()
  const birthDate = useProfilePrivate().data?.birth_date
  const name = useProfile().data?.display_name?.trim()
  const [today, setToday] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)

  // Client-only: the date and the "closed today" note come from this device.
  useEffect(() => {
    const now = new Date()
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
    setToday(day)
    try {
      setHidden(localStorage.getItem(DISMISS_KEY) === day)
    } catch {}
  }, [])

  if (!today || hidden || !isBirthday(birthDate)) return null
  const who = name && !name.startsWith("•") ? name : t("bot.birthdayYou")

  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-200/70 bg-linear-to-br from-amber-50 via-rose-50 to-emerald-50 p-4 shadow-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-500 dark:border-amber-900/50 dark:from-amber-500/10 dark:via-rose-500/10 dark:to-emerald-500/10">
      <PartyPopperIcon aria-hidden className="pointer-events-none absolute -right-3 -bottom-3 size-24 rotate-12 text-amber-500/15" />
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white text-rose-500 shadow-sm dark:bg-neutral-900">
          <CakeIcon className="size-6 animate-bounce [animation-iteration-count:2] motion-reduce:animate-none" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t("birthday.title", { name: who })}</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{t("birthday.body")}</p>
        </div>
        <button
          type="button"
          className="rounded-full p-1 text-muted-foreground hover:bg-white/60 dark:hover:bg-white/10"
          aria-label={t("common.close")}
          onClick={() => {
            setHidden(true)
            try {
              localStorage.setItem(DISMISS_KEY, today)
            } catch {}
          }}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </section>
  )
}
