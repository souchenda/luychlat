"use client"

import { BadgeCheckIcon, CalendarDaysIcon, CoinsIcon, LogOutIcon, MailIcon, PencilIcon, PhoneIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { ProfileSheet } from "@/components/profile/profile-sheets"
import { SettingsGroup, SettingsRow, SettingsSubHeader } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { signOutEverywhere } from "@/lib/auth/sign-out"
import { useActiveWorkspace, useProfile } from "@/lib/data/hooks"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"

/** My profile, read first: photo, name, contact and account details; "Edit profile" opens the form. */
export default function ProfilePage() {
  const t = useT()
  const router = useRouter()
  const locale = useLocaleStore((s) => s.locale)
  const user = useSessionStore((s) => s.user)
  const profile = useProfile().data
  const { workspace } = useActiveWorkspace()
  const [editOpen, setEditOpen] = useState(false)

  const name = profile?.display_name?.trim() || user?.email?.split("@")[0] || t("app.name")
  const phone = profile?.phone || (user?.phone ? `+${user.phone}` : "")
  const joined = user?.created_at
    ? new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(user.created_at))
    : null
  const notSet = <span className="text-muted-foreground">{t("profile.notSet")}</span>

  const signOut = async () => {
    if (!window.confirm(t("settings.signOutConfirm"))) return
    await signOutEverywhere()
    router.replace("/login")
  }

  return (
    <div className="space-y-6">
      <SettingsSubHeader title={t("profile.title")} />

      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <ProfileAvatar path={profile?.avatar_path} name={name} className="size-28 text-4xl ring-4 ring-background" />
        <div className="min-w-0 space-y-1 px-4">
          <h2 className="text-2xl font-bold break-words">{name}</h2>
          {profile?.bio?.trim() && <p className="text-sm whitespace-pre-line text-muted-foreground">{profile.bio.trim()}</p>}
        </div>
      </div>

      <SettingsGroup title={t("profile.contact")}>
        <SettingsRow icon={<PhoneIcon />} tile="emerald" title={t("profile.phone")} hint={phone ? <span className="text-sm text-foreground">{phone}</span> : notSet} />
        <SettingsRow
          icon={<MailIcon />}
          tile="sky"
          title={t("profile.email")}
          hint={user?.email ? <span className="block truncate text-sm text-foreground">{user.email}</span> : notSet}
        />
      </SettingsGroup>

      <SettingsGroup title={t("profile.accountCard")}>
        <SettingsRow icon={<CalendarDaysIcon />} tile="violet" title={t("profile.joined")} hint={joined ? <span className="text-sm text-foreground">{joined}</span> : notSet} />
        {workspace && (
          <>
            <SettingsRow
              icon={<BadgeCheckIcon />}
              tile="amber"
              title={t("profile.role")}
              hint={
                <span className="text-sm text-foreground">
                  {t(`family.role.${workspace.role}` as MessageKey)} · {workspace.type === "PERSONAL" ? t("ws.PERSONAL") : workspace.name}
                </span>
              }
            />
            <SettingsRow
              icon={<CoinsIcon />}
              tile="teal"
              title={t("profile.currency")}
              hint={<span className="text-sm text-foreground">{workspace.currency_default === "USD" ? "USD ($)" : "KHR (៛)"}</span>}
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

      <p className="px-4 text-center text-xs text-muted-foreground">{t("profile.visibility")}</p>

      <ProfileSheet open={editOpen} onOpenChange={setEditOpen} profile={profile} email={user?.email} />
    </div>
  )
}
