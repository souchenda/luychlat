"use client"

import { BadgeCheckIcon, CalendarClockIcon, CalendarDaysIcon, CameraIcon, ChevronRightIcon, CoinsIcon, CrownIcon, LogOutIcon, MailIcon, PencilIcon, PhoneIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { TestPlanSwitch } from "@/components/admin/test-plan"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { ProfileSheet } from "@/components/profile/profile-sheets"
import { SettingsGroup, SettingsSubHeader, TILE } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { signOutEverywhere } from "@/lib/auth/sign-out"
import { useActiveWorkspace, useProfile } from "@/lib/data/hooks"
import { dayDate } from "@/lib/dates"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { formatPhoneNumber } from "@/lib/format"
import { showUpgrade, usePlan } from "@/lib/plan"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"

/** One read-only line: a small muted label over a bold value, optionally with something on the right. */
function InfoRow({
  icon,
  tile,
  label,
  value,
  placeholder,
  trailing,
}: {
  icon: React.ReactNode
  tile: keyof typeof TILE
  label: string
  value?: React.ReactNode
  placeholder: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]", TILE[tile])}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        {value ? (
          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{placeholder}</p>
        )}
      </div>
      {trailing}
    </div>
  )
}

const TIER_BADGE = {
  FREE: { label: "🆓 FREE", className: "bg-muted text-muted-foreground" },
  PRO: { label: "💎 PRO", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  ULTRA: { label: "👑 ULTRA", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
} as const

/** My profile, read first: photo, name, contact and account details; "Edit profile" opens the form. */
export default function ProfilePage() {
  const t = useT()
  const router = useRouter()
  const locale = useLocaleStore((s) => s.locale)
  const user = useSessionStore((s) => s.user)
  const profile = useProfile().data
  const { workspace } = useActiveWorkspace()
  const { plan, isPro } = usePlan()
  const badge = TIER_BADGE[plan.tier] ?? TIER_BADGE.FREE
  const periodEnd = isPro && plan.period_end ? new Date(plan.period_end) : null
  const daysLeft = periodEnd ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / 86_400_000)) : 0
  const [editOpen, setEditOpen] = useState(false)

  const name = profile?.display_name?.trim() || user?.email?.split("@")[0] || t("app.name")
  const rawPhone = profile?.phone || (user?.phone ? `+${user.phone}` : "")
  const phone = rawPhone ? formatPhoneNumber(rawPhone) : ""
  const joined = user?.created_at ? dayDate(new Date(user.created_at), locale) : null

  const signOut = async () => {
    if (!window.confirm(t("settings.signOutConfirm"))) return
    await signOutEverywhere()
    router.replace("/login")
  }

  return (
    // Extra bottom room so Sign out sits well clear of the bottom bar and its + button.
    <div className="space-y-6 pb-10">
      <SettingsSubHeader title={t("profile.title")} />

      <div className="flex flex-col items-center gap-3 text-center">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="relative rounded-full transition-transform active:scale-95"
          aria-label={t(profile?.avatar_path ? "profile.changePhoto" : "profile.addPhoto")}
        >
          <ProfileAvatar path={profile?.avatar_path} name={name} className="size-28 text-4xl" />
          <span className="absolute right-0.5 bottom-0.5 flex size-9 items-center justify-center rounded-full border-[3px] border-background bg-primary text-primary-foreground shadow-sm">
            <CameraIcon className="size-4" aria-hidden />
          </span>
        </button>
        <div className="min-w-0 space-y-1 px-4">
          <h2 className="text-2xl font-bold break-words">{name}</h2>
          {profile?.bio?.trim() && <p className="text-sm whitespace-pre-line text-muted-foreground">{profile.bio.trim()}</p>}
        </div>
      </div>

      <SettingsGroup title={t("profile.contact")}>
        <InfoRow icon={<PhoneIcon />} tile="emerald" label={t("profile.phone")} value={phone} placeholder={t("profile.notSet")} />
        <InfoRow icon={<MailIcon />} tile="sky" label={t("profile.email")} value={user?.email} placeholder={t("profile.notSet")} />
      </SettingsGroup>

      <SettingsGroup title={t("profile.accountCard")}>
        <InfoRow
          icon={<CrownIcon />}
          tile="amber"
          label={t("profile.membership")}
          value={<span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold tracking-wide", badge.className)}>{badge.label}</span>}
          placeholder=""
        />
        <TestPlanSwitch />
        {periodEnd ? (
          <InfoRow
            icon={<CalendarClockIcon />}
            tile={daysLeft <= 7 ? "rose" : "sky"}
            label={t("profile.validity")}
            value={
              <>
                {t("profile.expiresOn", { date: dayDate(periodEnd, locale) })}
                <span className={cn("block text-xs font-normal", daysLeft <= 7 ? "text-destructive" : "text-muted-foreground")}>
                  {t("profile.daysLeft", { days: daysLeft })}
                </span>
              </>
            }
            placeholder=""
            trailing={
              <Button size="sm" variant="outline" className="h-8 shrink-0 rounded-full" onClick={() => showUpgrade("general")}>
                {t(plan.tier === "ULTRA" ? "plan.renew" : "profile.renewOrUpgrade")}
              </Button>
            }
          />
        ) : (
          <button type="button" onClick={() => showUpgrade("general")} className="block w-full text-left transition-colors hover:bg-muted/60">
            <InfoRow
              icon={<CalendarClockIcon />}
              tile="slate"
              label={t("profile.validity")}
              value={t("profile.freePlan")}
              placeholder=""
              trailing={
                <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  {t("profile.upgradePlan")}
                  <ChevronRightIcon className="size-3.5" aria-hidden />
                </span>
              }
            />
          </button>
        )}
        <InfoRow icon={<CalendarDaysIcon />} tile="violet" label={t("profile.joined")} value={joined} placeholder={t("profile.notSet")} />
        {workspace && (
          <>
            <InfoRow
              icon={<BadgeCheckIcon />}
              tile="amber"
              label={t("profile.role")}
              value={`${t(`family.role.${workspace.role}` as MessageKey)} · ${workspace.type === "PERSONAL" ? t("ws.PERSONAL") : workspace.name}`}
              placeholder=""
            />
            <InfoRow
              icon={<CoinsIcon />}
              tile="teal"
              label={t("profile.currency")}
              value={workspace.currency_default === "USD" ? "USD ($)" : "KHR (៛)"}
              placeholder=""
            />
          </>
        )}
      </SettingsGroup>

      <div className="space-y-3">
        <Button className="h-12 w-full rounded-xl text-base" onClick={() => setEditOpen(true)}>
          <PencilIcon />
          {t("profile.edit")}
        </Button>
        <Button variant="outline" className="h-12 w-full rounded-xl text-base text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={signOut}>
          <LogOutIcon />
          {t("settings.signOut")}
        </Button>
      </div>

      {/* The privacy note ("who can see this") lives in the edit sheet, next to the fields it's about. */}
      <ProfileSheet open={editOpen} onOpenChange={setEditOpen} profile={profile} email={user?.email} />
    </div>
  )
}
