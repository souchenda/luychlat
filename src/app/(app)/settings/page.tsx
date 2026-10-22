"use client"

import { BellIcon, BookOpenIcon, SmartphoneIcon, StoreIcon, Volume2Icon, ChartColumnIcon, CheckCircle2Icon, CoinsIcon, CompassIcon, CrownIcon, DatabaseIcon, EyeOffIcon, InfoIcon, LanguagesIcon, LifeBuoyIcon, LightbulbIcon, LogOutIcon, MoonIcon, MoonStarIcon, SendIcon, ShieldCheckIcon, SparklesIcon, TagsIcon, TargetIcon, UserXIcon, UsersIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { ProfileAvatar } from "@/components/profile/profile-avatar"
import { AboutSheet, SettingsFooter } from "@/components/settings/about"
import { GuestImportRow } from "@/components/settings/guest-import"
import { useOfficialBot, useTelegramLink } from "@/components/settings/official-bot"
import { SettingsGroup, SettingsRow, StatusBadge } from "@/components/settings/settings-ui"
import { PushSettingsRow } from "@/components/notifications/push-prompt"
import { playPaymentChimeSound, requestPaymentChimePermission, speakPayment } from "@/components/payments/payment-chime-listener"
import { SOUND_TESTS } from "@/lib/payment-chime"
import { formatMoney } from "@/lib/money"
import { askMotionOnce } from "@/components/privacy/flip-to-hide"
import { useHolyDayChimeSetting } from "@/components/dashboard/holy-day-reminder"
import { playTempleBell } from "@/lib/temple-bell-player"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { APP_VERSION } from "@/lib/app-info"
import { signOutEverywhere } from "@/lib/auth/sign-out"
import { useActiveWorkspace, useProfile, useWorkspaces } from "@/lib/data/hooks"
import { useSaveExchangeRate } from "@/lib/exchange-rate"
import { useT } from "@/lib/i18n/use-t"
import { canManageIslamicMode } from "@/lib/islamic-access"
import { khmerLunarDate } from "@/lib/khmer-lunar"
import { todayDate } from "@/lib/debts"
import { latinDigits } from "@/lib/dates"
import { formatHijri, toHijri } from "@/lib/islamic"
import { useIslamicMutations, useIslamicSettings } from "@/lib/islamic-settings"
import { parseAmount } from "@/lib/money"
import { usePlan } from "@/lib/plan"
import { useMarket } from "@/lib/market"
import { useLocaleStore } from "@/stores/locale-store"
import { usePrefsStore } from "@/stores/prefs-store"
import { useSessionStore } from "@/stores/session-store"
import { loginLabel } from "@/lib/auth-identifier"
import { DeleteAccountSheet } from "@/components/settings/delete-account"
import { useOnboardingStore } from "@/lib/onboarding"

/** Today in each calendar — what the Islamic Mode switch changes in the home header (founder, 18/10/2026). */
function calendarExamples(locale: string): { lunar: string; hijri: string } {
  const l = khmerLunarDate(todayDate())
  const km = locale === "km"
  const lunar = km ? latinDigits(`${l.day}${l.phase === "kert" ? "កើត" : "រោច"} · ថ្ងៃសីល`) : `${l.day} ${l.phase === "kert" ? "waxing" : "waning"} · holy day`
  const h = toHijri(new Date())
  return { lunar, hijri: h ? formatHijri(h, km ? "km" : "en", { short: true }) : "—" }
}

/** Islamic Lifestyle & Finance Mode (off by default, 100% free); private to the user (synced, never shown to family). */
function IslamicToolsRow() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { settings, loading } = useIslamicSettings()
  const { setEnabled } = useIslamicMutations()
  // Admin / owner only (founder, 18/10/2026): everyone else sees it locked 🔒; the database refuses the change too.
  const canManage = canManageIslamicMode(usePlan().plan)
  return (
    <>
      <SettingsRow
        icon={<MoonStarIcon />}
        tile="teal"
        title={t("islamic.mode")}
        hint={canManage ? `${t("islamic.modeHint")} · ${t("islamic.modeCalendar", calendarExamples(locale))}` : `🔒 ${t("islamic.managedByAdmin")}`}
      >
        <Switch
          checked={settings.enabled}
          disabled={!canManage || loading || setEnabled.isPending}
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
  const nbc = useMarket().data?.nbc?.usd_khr
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
    <SettingsRow
      icon={<CoinsIcon />}
      tile="amber"
      title={t("settings.exchangeRate")}
      hint={
        readOnly ? (
          t("settings.exchangeRateFamily")
        ) : nbc && Math.round(nbc) !== khrPerUsd ? (
          // One tap to the National Bank of Cambodia's official rate of the day.
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60"
            disabled={saveRate.isPending}
            onClick={() =>
              saveRate.mutate(Math.round(nbc), {
                onSuccess: () => toast.success(t("settings.useNbcDone")),
                onError: () => toast.error(t("common.error")),
              })
            }
          >
            {t("settings.useNbc", { rate: new Intl.NumberFormat("en-US").format(Math.round(nbc)) })}
          </button>
        ) : undefined
      }
    >
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

/**
 * 💰 «សំឡេងពេលទទួលបានប្រាក់»: the payment chime on this phone (founder, 21/10/2026 — components/payments/payment-chime-
 * listener.tsx). Only for someone in a Business workspace (KHQR sales ring there). Turning it on asks the Android app's
 * notification permission and plays the chime once.
 */
function PaymentChimeRow() {
  const t = useT()
  const business = (useWorkspaces().data ?? []).some((w) => w.type === "BUSINESS")
  const on = usePrefsStore((s) => s.paymentChime)
  const set = usePrefsStore((s) => s.setPaymentChime)
  if (!business) return null
  return (
    <SettingsRow icon={<CoinsIcon />} tile="emerald" title={t("settings.paymentChime")} hint={t("settings.paymentChimeHint")}>
      <Switch
        checked={on}
        aria-label={t("settings.paymentChime")}
        onCheckedChange={(v) => {
          set(v)
          if (!v) return
          playPaymentChimeSound()
          void requestPaymentChimePermission().then((ok) => {
            if (!ok) toast.error(t("settings.paymentChimeDenied"))
          })
        }}
      />
    </SettingsRow>
  )
}

/**
 * 🏪 «មុខងារ Soundbox លើតុគិតលុយ» (Task #442): this phone as the shop's counter soundbox — the screen kept on in the app,
 * the chime and the spoken amount on (components/payments/counter-mode.tsx). Business workspaces only.
 */
function CounterModeRow() {
  const t = useT()
  const business = (useWorkspaces().data ?? []).some((w) => w.type === "BUSINESS")
  const on = usePrefsStore((s) => s.counterMode)
  const set = usePrefsStore((s) => s.setCounterMode)
  if (!business) return null
  return (
    <SettingsRow icon={<StoreIcon />} tile="emerald" title={t("settings.counterMode")} hint={t("settings.counterModeHint")}>
      <Switch
        checked={on}
        aria-label={t("settings.counterMode")}
        onCheckedChange={(v) => {
          set(v)
          if (!v) return
          // A tap: the browser now allows sound — the chime once, so the cashier hears it is ready.
          playPaymentChimeSound()
          void requestPaymentChimePermission()
        }}
      />
    </SettingsRow>
  )
}

/**
 * 🔊 Sound test (Task #463): the chime and the Khmer amount, one tap — the counter staff hear the volume and the voice.
 * Business owners only, with the counter mode.
 */
function SoundTestRow() {
  const t = useT()
  const business = (useWorkspaces().data ?? []).some((w) => w.type === "BUSINESS")
  if (!business) return null
  return (
    <SettingsRow icon={<Volume2Icon />} tile="emerald" title={t("settings.soundTest")} hint={t("settings.soundTestHint")}>
      <div className="flex flex-col gap-1.5">
        {SOUND_TESTS.map((s) => (
          <Button key={s.currency} type="button" size="sm" variant="outline" className="h-9 gap-1.5 rounded-xl" onClick={() => playPaymentChimeSound(() => speakPayment(s))}>
            <Volume2Icon className="size-4" aria-hidden />
            {formatMoney(s.amount, s.currency)}
          </Button>
        ))}
      </div>
    </SettingsRow>
  )
}

/** 📱 «ផ្កាប់ទូរសព្ទដើម្បីលាក់សមតុល្យ» (Task #461): face down → the balances masked. On by default; turning it on asks iOS. */
function FlipToHideRow() {
  const t = useT()
  const on = usePrefsStore((s) => s.flipToHide)
  const set = usePrefsStore((s) => s.setFlipToHide)
  return (
    <SettingsRow icon={<SmartphoneIcon />} tile="slate" title={t("settings.flipToHide")} hint={t("settings.flipToHideHint")}>
      <Switch
        checked={on}
        aria-label={t("settings.flipToHide")}
        onCheckedChange={(v) => {
          set(v)
          if (v) askMotionOnce()
        }}
      />
    </SettingsRow>
  )
}

/** 🪷 «សំឡេងរំលឹកថ្ងៃសីល»: the bell with Home's holy-day reminder (turning it on plays it once). Not with Islamic Mode. */
function HolyDayChimeRow() {
  const t = useT()
  const { visible, on, set } = useHolyDayChimeSetting()
  if (!visible) return null
  return (
    <SettingsRow icon={<BellIcon />} tile="amber" title={t("settings.holyDayChime")} hint={t("settings.holyDayChimeHint")}>
      <Switch
        checked={on}
        aria-label={t("settings.holyDayChime")}
        onCheckedChange={(v) => {
          set(v)
          if (v) playTempleBell()
        }}
      />
    </SettingsRow>
  )
}

export default function SettingsPage() {
  const t = useT()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const { locale, setLocale } = useLocaleStore()
  const user = useSessionStore((s) => s.user)
  const profile = useProfile().data
  const { plan, isPro } = usePlan()
  const hideBalances = usePrefsStore((s) => s.hideBalances)
  const toggleHideBalances = usePrefsStore((s) => s.toggleHideBalances)
  const bot = useOfficialBot()
  const telegram = useTelegramLink()
  const [aboutOpen, setAboutOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  // next-themes only knows the theme after mounting.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const name = profile?.display_name?.trim() || loginLabel(user?.email).split("@")[0] || t("app.name")
  const contact = loginLabel(user?.email) || (user?.phone ? `+${user.phone}` : "")

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
        <FlipToHideRow />
        <SettingsRow icon={<LanguagesIcon />} tile="violet" title={t("settings.language")}>
          <div className="w-52 shrink-0">
            <Segmented
              aria-label={t("settings.language")}
              value={locale}
              onChange={(v) => setLocale(v)}
              options={[
                { value: "km", label: "🇰🇭 ខ្មែរ" },
                { value: "en", label: "🇬🇧 EN" },
                { value: "zh", label: "🇨🇳 中文" },
              ]}
            />
          </div>
        </SettingsRow>
        <IslamicToolsRow />
        <PushSettingsRow />
        <PaymentChimeRow />
        <CounterModeRow />
        <SoundTestRow />
        <HolyDayChimeRow />
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
        <SettingsRow href="/learn" icon={<LightbulbIcon />} tile="amber" title={t("tips.hubTitle")} hint={t("tips.settingsHint")} />
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
        <SettingsRow onClick={() => useOnboardingStore.getState().show()} icon={<CompassIcon />} tile="emerald" title={t("onboarding.replay")} hint={t("onboarding.replayHint")} />
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

      {/* Danger zone: the account and everything in it, for good (store requirement). */}
      <SettingsGroup title={t("deleteAccount.zone")}>
        <SettingsRow
          onClick={() => setDeleteOpen(true)}
          chevron={false}
          icon={<UserXIcon />}
          tile="rose"
          title={<span className="text-destructive">{t("deleteAccount.title")}</span>}
          hint={t("deleteAccount.rowHint")}
        />
      </SettingsGroup>

      <SettingsFooter />

      <AboutSheet open={aboutOpen} onOpenChange={setAboutOpen} />
      <DeleteAccountSheet open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  )
}
