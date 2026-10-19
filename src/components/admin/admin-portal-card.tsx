"use client"

import { BookHeartIcon, ChevronRightIcon, MapPinIcon, Music2Icon, SettingsIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { Card } from "@/components/ui/card"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { useMfaState } from "@/lib/mfa"
import { usePlan } from "@/lib/plan"

/**
 * «⚙️ ផ្ទាំងគ្រប់គ្រងអេដមីន» on a staff member's profile (founder, 19/10/2026): one tap to the content they manage —
 * places, qasidah, du'as (their role is enough) — and the admin console, which asks for 2FA (it says so until 2FA is on).
 */
const LINKS: { href: string; label: MessageKey; icon: LucideIcon }[] = [
  { href: "/islamic/places", label: "adminPortal.places", icon: MapPinIcon },
  { href: "/islamic/nasheed", label: "adminPortal.qasidah", icon: Music2Icon },
  { href: "/islamic/duas", label: "adminPortal.duas", icon: BookHeartIcon },
]

export function AdminPortalCard() {
  const t = useT()
  const role = usePlan().plan.staff_role
  const mfa = useMfaState().data
  if (role !== "admin" && role !== "super_admin" && role !== "content_admin") return null
  const consoleReady = Boolean(mfa?.factorId)
  return (
    <Card className="gap-2 border-amber-400/50 bg-linear-to-br from-emerald-600/10 to-amber-400/10 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <SettingsIcon className="size-4 text-emerald-700 dark:text-emerald-300" aria-hidden />
        ⚙️ {t("adminPortal.title")}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border bg-card px-1 py-2 text-center text-[11px] font-medium">
            <Icon className="size-[18px] text-emerald-700 dark:text-emerald-300" aria-hidden />
            {t(label)}
          </Link>
        ))}
      </div>
      {role !== "content_admin" && (
      <Link href={consoleReady ? "/admin" : "/settings/security"} className="flex min-h-11 items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t("adminPortal.console")}</span>
          {!consoleReady && <span className="block text-[11px] text-muted-foreground">{t("adminPortal.needs2fa")}</span>}
        </span>
        <ChevronRightIcon className="size-4 opacity-60" aria-hidden />
      </Link>
      )}
    </Card>
  )
}
