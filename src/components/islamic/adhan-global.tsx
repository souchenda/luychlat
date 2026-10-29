"use client"

import { BadgeCheckIcon, GlobeIcon, Loader2Icon, LockIcon, MoonStarIcon, PauseIcon, PlayIcon, SunriseIcon, UploadIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useSyncExternalStore } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { availablePresets, UNLICENSED_PRESETS, type AdhanDefaults } from "@/lib/adhan-presets"
import { useAdhanDefaults, useGlobalAdhanPresets, useSetAdhanDefault } from "@/lib/adhan-presets-data"
import { pick } from "@/lib/i18n/dictionaries"
import { useKhmerT } from "@/lib/i18n/use-t"
import { currentSource, onPlaybackChange, playPreset, stopSound } from "@/lib/prayer-alerts"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"
import { latinDigits } from "@/lib/dates"

/**
 * The app-wide default Adhans (founder, 19/10/2026): under each track a content manager taps «🌐 កំណត់ជាសកល» (the
 * regular prayers) or «🌅 កំណត់ជាសកល Fajr»; «✅ កំពុងប្រើជាសកល» marks the current ones. Every member who has not chosen
 * an Adhan of their own hears them (lib/adhan-presets resolvePreset / adhanForPrayer). Audited ADHAN_PUBLISH.
 */
export function AdhanGlobalButtons({ presetId, defaults }: { presetId: string; defaults: AdhanDefaults }) {
  const t = useKhmerT()
  const set = useSetAdhanDefault()
  const regular = defaults.regular === presetId
  const fajr = defaults.fajr === presetId
  const choose = (kind: "regular" | "fajr") =>
    set.mutate(
      { kind, preset: presetId },
      { onSuccess: () => toast.success(t("adhanGlobal.saved")), onError: () => toast.error(t("common.error")) },
    )
  const button = (kind: "regular" | "fajr", active: boolean, label: string, Icon: LucideIcon) =>
    active ? (
      <span className="inline-flex h-8 items-center gap-1 rounded-full bg-emerald-600 px-2.5 text-[11px] font-semibold text-white">
        <BadgeCheckIcon className="size-3.5" aria-hidden />
        {t("adhanGlobal.active")} · {kind === "fajr" ? "Fajr" : t("adhanGlobal.regular")}
      </span>
    ) : (
      <Button size="sm" variant="outline" className="h-8 px-2.5 text-[11px]" disabled={set.isPending} onClick={() => choose(kind)}>
        {set.isPending && set.variables?.kind === kind && set.variables.preset === presetId ? <Loader2Icon className="animate-spin" /> : <Icon aria-hidden />}
        {label}
      </Button>
    )
  return (
    <div className="flex w-full flex-wrap gap-1.5">
      {button("regular", regular, t("adhanGlobal.setRegular"), GlobeIcon)}
      {button("fajr", fajr, t("adhanGlobal.setFajr"), SunriseIcon)}
    </div>
  )
}

const usePlaying = () => useSyncExternalStore(onPlaybackChange, currentSource, () => null)

/** The Adhan manager on /admin: every playable track (bundled and published), its preview, and the two defaults. */
export function AdhanManager() {
  const t = useKhmerT()
  const locale = useLocaleStore((s) => s.locale)
  const global = useGlobalAdhanPresets()
  const defaults = useAdhanDefaults()
  const playing = usePlaying()
  return (
    <Card className="gap-3 px-4 py-4">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <MoonStarIcon className="size-4 shrink-0 text-amber-500" aria-hidden />
          {t("adhanGlobal.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("adhanGlobal.hint")}</p>
      </div>
      {availablePresets(global).map((p) => (
        <div key={p.id} className={cn("space-y-2 rounded-xl border px-3 py-2.5", (defaults.regular === p.id || defaults.fajr === p.id) && "border-emerald-500 bg-emerald-500/5")}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{pick(p.name, locale)}</span>
              {p.credit && <span className="block truncate text-[11px] text-muted-foreground">{latinDigits(p.credit)}</span>}
            </span>
            <Button
              size="icon"
              variant={playing === p.id ? "default" : "outline"}
              className="size-9 shrink-0 rounded-full"
              aria-label={t("prayerAlert.preview")}
              onClick={() => (playing === p.id ? stopSound() : void playPreset(p.file!, p.id))}
            >
              {playing === p.id ? <PauseIcon /> : <PlayIcon />}
            </Button>
          </div>
          <AdhanGlobalButtons presetId={p.id} defaults={defaults} />
        </div>
      ))}
      {UNLICENSED_PRESETS.length > 0 && (
        <div className="space-y-1.5 rounded-xl bg-muted/50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <LockIcon className="size-3.5" aria-hidden />
            {t("adhanGlobal.unlicensedTitle")}
          </p>
          {UNLICENSED_PRESETS.map((p) => (
            <p key={p.id} className="text-xs text-muted-foreground">
              • {pick(p.name, locale)}
            </p>
          ))}
          <p className="text-[11px] text-muted-foreground">{t("adhanGlobal.unlicensedHint")}</p>
        </div>
      )}
      <Button asChild variant="outline" className="h-11 w-full">
        <Link href="/islamic/prayer">
          <UploadIcon />
          {t("adhanGlobal.upload")}
        </Link>
      </Button>
    </Card>
  )
}
