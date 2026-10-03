"use client"

import {
  BookOpenIcon,
  ChartColumnIcon,
  CheckCircle2Icon,
  CoinsIcon,
  CrownIcon,
  DatabaseIcon,
  EyeOffIcon,
  InfoIcon,
  LanguagesIcon,
  LifeBuoyIcon,
  LogOutIcon,
  MoonIcon,
  MoonStarIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TagsIcon,
  TargetIcon,
  UsersIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { AboutSheet, SettingsFooter } from "@/components/settings/about"
import { GuestImportRow } from "@/components/settings/guest-import"
import { useOfficialBot, useTelegramLink } from "@/components/settings/official-bot"
import { SettingsGroup, SettingsRow, StatusBadge } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { APP_VERSION } from "@/lib/app-info"
import { signOutEverywhere } from "@/lib/auth/sign-out"
import { useActiveWorkspace, useProfile } from "@/lib/data/hooks"
import { useSaveExchangeRate } from "@/lib/exchange-rate"
import { useT } from "@/lib/i18n/use-t"
import { useIslamicMutations, useIslamicSettings } from "@/lib/islamic-settings"
import { parseAmount } from "@/lib/money"
import { usePlan } from "@/lib/plan"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"

/** Islamic Lifestyle & Finance Mode (off by default, 100% free); private to the user (synced, never shown to family). */
function IslamicToolsRow() {
  const t = useT()
  const { settings, loading } = useIslamicSettings()
  const { setEnabled } = useIslamicMutations()
  return (
    <>
      <SettingsRow icon={<MoonStarIcon />} tile="teal" title={t("islamic.mode")} hint={t("islamic.modeHint")}>
        <Switch
          checked={settings.enabled}
          disabled={loading || setEnabled.isPending}
          onCheckedChange={(on) =>
            setEnabled.mutate(on, {
              onSuccess: () => toast.success(t(on ? "islamic.enabled" : "islamic.disabled")),
              onError: () => toast.error(t("common.error")),
            })
          }
          aria-label={t("islamic.mode")}
        />
      </SettingsRow>
      {settings.enabled && <SettingsRow href="/islamic" className="pl-16" title={t("islamic.open")} hint={t("islamic.openHint")} />}
    </>
  )
}

function ExchangeRateRow() {
  const t = useT()
  const khrPerUsd = usePrefsStore((s) => s.khrPerUsd)
  const { workspace } = useActiveWorkspace()
  const saveRate = useSaveExchangeRate()
  const [value, setValue] = useState(String(khrPerUsd))
  const parsed = parseAmount(value)
  const valid = parsed >= 1000 && parsed <= 10000
  // In someone else's family workspace the owner's saved rate applies.
  const readOnly = workspace?.type === "FAMILY" && workspace.role !== "OWNER"

  // Show the saved rate once it arrives from the database.
  useEffect(() => setValue(String(khrPerUsd)), [khrPerUsd])

  const save = () => {
    if (!valid || readOnly) return
    saveRate.mutate(Math.round(parsed), {
      onSuccess: () => toast.success(t("settings.rateSaved")),
      onError: () => toast.error(t("common.error")),
    })
  }

  return (
    <SettingsRow icon={<CoinsIcon />} tile="amber" title={t("settings.exchangeRate")} hint={readOnly ? t("settings.exchangeRateFamily") : undefined}>
      <form
        className="flex shrink-0 items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <span className="text-xs text-muted-foreground">$1 =</span>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="numeric"
          className="h-8 w-16 px-2 text-right tabular-nums"
          aria-label={t("settings.exchangeRate")}
          aria-invalid={!valid}
          disabled={readOnly}
        />
        <span className="text-xs text-muted-foreground">៛</span>
        {!readOnly && valid && Math.round(parsed) !== khrPerUsd && (
          <Button type="submit" size="sm" disabled={saveRate.isPending}>
            {t("common.save")}
          </Button>
        )}
      </form>
    </SettingsRow>
  )
}

export default function SettingsPage() {
  const t = useT()
  const router = useRouter()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { locale, setLocale } = useLocaleStore()
  const user = useSessionStore((s) => s.user)
  const profile = useProfile().data
  const { plan, isPro } = usePlan()
  const hideBalances = usePrefsStore((s) => s.hideBalances)
  const toggleHideBalances = usePrefsStore((s) => s.toggleHideBalances)
  const bot = useOfficialBot()
  const telegram = useTelegramLink()
  const [aboutOpen, setAboutOpen] = useState(false)
  // next-themes only knows the theme after mounting.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const name = profile?.display_name?.trim() || user?.email?.split("@")[0] || t("app.name")
  const contact = user?.email || (user?.phone ? `+${user.phone}` : "")

  const signOut = async () => {
    if (!window.confirm(t("settings.signOutConfirm"))) return
    await signOutEverywhere()
    router.replace("/login")
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("settings.title")}</h1>

      <SettingsGroup title={t("settings.account")}>
        <SettingsRow
          href="/profile"
          className="py-3"
          icon={undefined}
          title={<span className="block truncate text-base font-semibold">{name}</span>}
          hint={<span className="block truncate">{contact}</span>}
        >
          <ProfileAvatar path={profile?.avatar_path} name={name} className="order-first size-12" />
        </SettingsRow>
        <SettingsRow href="/settings/security" icon={<ShieldCheckIcon />} tile="emerald" title={t("settings.security")} hint={t("settings.securityHint")} />
        <GuestImportRow />
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.prefs")}>
        <SettingsRow
          icon={<MoonIcon />}
          tile="indigo"
          title={t("settings.darkMode")}
          hint={mounted && theme === "system" ? t("settings.darkModeSystem") : undefined}
        >
          <Switch
            checked={mounted && resolvedTheme === "dark"}
            onCheckedChange={(dark) => setTheme(dark ? "dark" : "light")}
            aria-label={t("settings.darkMode")}
          />
        </SettingsRow>
        <SettingsRow icon={<EyeOffIcon />} tile="slate" title={t("settings.hideBalances")} hint={t("settings.hideBalancesHint")}>
          <Switch checked={hideBalances} onCheckedChange={toggleHideBalances} aria-label={t("settings.hideBalances")} />
        </SettingsRow>
        <SettingsRow icon={<LanguagesIcon />} tile="violet" title={t("settings.language")}>
          <Select value={locale} onValueChange={(v) => setLocale(v as "km" | "en")}>
            <SelectTrigger size="sm" className="h-7 rounded-full border-0 bg-violet-500/15 px-3 text-xs font-medium text-violet-700 shadow-none hover:bg-violet-500/25 dark:bg-violet-500/20 dark:text-violet-300 dark:hover:bg-violet-500/30" aria-label={t("settings.language")}>
              {locale === "km" ? "ភាសាខ្មែរ" : "English"}
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="km">ភាសាខ្មែរ</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
        <IslamicToolsRow />
        <SettingsRow href="/settings/telegram" icon={<SendIcon />} tile="sky" title={t("settings.telegramBot")}>
          {bot.data && telegram.data ? (
            <StatusBadge tone="success">
              <CheckCircle2Icon aria-hidden />
              {t("settings.telegramConnected")}
            </StatusBadge>
          ) : (
            <StatusBadge tone="info">{t("settings.telegramConnect")}</StatusBadge>
          )}
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.general")}>
        <SettingsRow href="/categories" icon={<TagsIcon />} tile="rose" title={t("settings.categories")} />
        <SettingsRow href="/budgets" icon={<TargetIcon />} tile="emerald" title={t("budget.title")} hint={t("budget.settingsHint")} />
        <SettingsRow href="/reports" icon={<ChartColumnIcon />} tile="sky" title={t("reports.title")} hint={t("reports.settingsHint")} />
        <ExchangeRateRow />
        <SettingsRow href="/settings/family" icon={<UsersIcon />} tile="violet" title={t("family.section")} hint={t("settings.familyHint")} />
        <SettingsRow href="/settings/ai" icon={<SparklesIcon />} tile="indigo" title={t("aiSettings.title")} hint={t("settings.aiHint")} />
        <SettingsRow href="/settings/plan" icon={<CrownIcon />} tile="amber" title={t("settings.planRow")} hint={t("settings.planRowHint")}>
          {isPro ? (
            <StatusBadge tone="pro">
              <CrownIcon aria-hidden />
              {plan.tier}
            </StatusBadge>
          ) : (
            <StatusBadge>{t("plan.free")}</StatusBadge>
          )}
        </SettingsRow>
        <SettingsRow href="/settings/data" icon={<DatabaseIcon />} tile="slate" title={t("settings.dataRow")} hint={t("settings.dataRowHint")} />
      </SettingsGroup>

      <SettingsGroup title={t("settings.group.about")}>
        <SettingsRow href="/guide" icon={<BookOpenIcon />} tile="teal" title={t("guide.title")} hint={t("guide.settingsHint")} />
        <SettingsRow href="/support" icon={<LifeBuoyIcon />} tile="sky" title={t("support.title")} hint={t("support.settingsHint")} />
        <SettingsRow onClick={() => setAboutOpen(true)} icon={<InfoIcon />} tile="emerald" title={t("about.title")}>
          <StatusBadge>v{APP_VERSION}</StatusBadge>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          onClick={signOut}
          chevron={false}
          icon={<LogOutIcon />}
          tile="rose"
          title={<span className="text-destructive">{t("settings.signOut")}</span>}
        />
      </SettingsGroup>

      <SettingsFooter />

      <AboutSheet open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  )
}
