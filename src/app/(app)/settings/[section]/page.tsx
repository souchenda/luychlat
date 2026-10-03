"use client"

import { notFound, useParams } from "next/navigation"

import { PlanCard } from "@/components/billing/plan-card"
import { ReferralCard } from "@/components/billing/referral"
import { FamilySettings } from "@/components/family/family-settings"
import { AiSettingsCard } from "@/components/settings/ai-settings"
import { DangerZone } from "@/components/settings/danger-zone"
import { DataManagement } from "@/components/settings/data-management"
import { InstallAppCard } from "@/components/settings/install-app"
import { OfficialBotCard } from "@/components/settings/official-bot"
import { SecuritySettings } from "@/components/settings/security-settings"
import { SettingsSubHeader } from "@/components/settings/settings-ui"
import { TelegramSettingsCard } from "@/components/settings/telegram-settings"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"

/** Settings sub-pages, opened from the rows on /settings. */
const SECTIONS: Record<string, { title: MessageKey; render: () => React.ReactNode }> = {
  security: { title: "settings.security", render: () => <SecuritySettings /> },
  telegram: { title: "settings.telegramBot", render: () => <OfficialBotCard legacy={<TelegramSettingsCard />} /> },
  plan: {
    title: "settings.planRow",
    render: () => (
      <>
        <PlanCard />
        <ReferralCard />
      </>
    ),
  },
  family: { title: "family.section", render: () => <FamilySettings /> },
  ai: { title: "aiSettings.title", render: () => <AiSettingsCard /> },
  data: {
    title: "settings.dataRow",
    render: () => (
      <>
        <InstallAppCard />
        <DataManagement />
        <DangerZone />
      </>
    ),
  },
}

export default function SettingsSectionPage() {
  const t = useT()
  const { section } = useParams<{ section: string }>()
  const page = SECTIONS[section]
  if (!page) notFound()
  return (
    <div className="space-y-6">
      <SettingsSubHeader title={t(page.title)} />
      {page.render()}
    </div>
  )
}
