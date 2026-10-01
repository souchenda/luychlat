"use client"

import { CheckIcon, PaletteIcon } from "lucide-react"

import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"
import { resolveSeason, seasonOn, SEASONS } from "@/lib/theme/seasons"
import { usePrefsStore } from "@/stores/prefs-store"

/** Settings › colour theme: follow the festive calendar, or pick one (applies immediately). */
export function ThemePicker() {
  const t = useT()
  const choice = usePrefsStore((s) => s.colorTheme)
  const setChoice = usePrefsStore((s) => s.setColorTheme)
  const auto = choice === "auto"
  const active = resolveSeason(choice)
  const current = seasonOn() ?? "default"
  const currentName = t(SEASONS.find((s) => s.key === current)!.name)

  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-sm font-medium text-muted-foreground">
        <PaletteIcon className="size-4" aria-hidden />
        {t("theme.title")}
      </h2>
      <Card className="gap-0 divide-y py-0">
        <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t("theme.auto")}</p>
            <p className="text-xs text-muted-foreground">{t("theme.autoHint", { season: currentName })}</p>
          </div>
          {/* Turning auto off keeps today's colours as the manual choice. */}
          <Switch checked={auto} onCheckedChange={(on) => setChoice(on ? "auto" : active)} aria-label={t("theme.auto")} />
        </label>
        <div role="radiogroup" aria-label={t("theme.title")} className="grid grid-cols-3 gap-2 p-3">
          {SEASONS.map((s) => {
            const selected = active === s.key
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChoice(s.key)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-colors",
                  selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
                )}
              >
                <span
                  className="relative flex size-11 items-center justify-center rounded-full shadow-sm ring-2 ring-background"
                  style={{ background: `linear-gradient(135deg, ${s.swatch[0]}, ${s.swatch[1]})` }}
                  aria-hidden
                >
                  {selected && <CheckIcon className="size-5 text-white drop-shadow" />}
                </span>
                <span className="line-clamp-2 text-[11px] leading-tight">{t(s.name)}</span>
                {auto && s.key === current && (
                  <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{t("theme.now")}</span>
                )}
              </button>
            )
          })}
        </div>
      </Card>
    </section>
  )
}
