"use client"

import { BadgeCheckIcon, ClockIcon, LandmarkIcon, MapIcon, PhoneIcon, PlusIcon, SearchIcon, TentIcon, UtensilsIcon, type LucideIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { useIslamicLocation } from "@/components/islamic/location-picker"
import { PlaceFormSheet } from "@/components/islamic/place-form-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/lib/i18n/use-t"
import { mapsUrl, PLACE_KINDS, usePlaces, type PlaceKind } from "@/lib/places"
import { distanceKm } from "@/lib/prayer"
import { cn } from "@/lib/utils"

const ICONS: Record<PlaceKind, LucideIcon> = { MOSQUE: LandmarkIcon, SURAU: TentIcon, HALAL: UtensilsIcon }
const TONES: Record<PlaceKind, string> = {
  MOSQUE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  SURAU: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  HALAL: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
}

/** Searchable list of mosques, surau and halal food, nearest first. Places are added by admins or suggested by users. */
export default function PlacesPage() {
  const t = useT()
  const location = useIslamicLocation()
  const { data, isLoading } = usePlaces()
  const [kind, setKind] = useState<PlaceKind | "ALL">("ALL")
  const [query, setQuery] = useState("")
  const [suggestOpen, setSuggestOpen] = useState(false)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? [])
      .filter((p) => (kind === "ALL" || p.kind === kind) && (!q || [p.name, p.province, p.address].some((v) => v?.toLowerCase().includes(q))))
      .map((p) => ({ ...p, km: p.lat != null && p.lng != null ? distanceKm(location, { lat: p.lat, lng: p.lng }) : null }))
      .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.name.localeCompare(b.name))
  }, [data, kind, query, location])

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("places.search")} className="h-10 pl-9" aria-label={t("places.search")} />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(["ALL", ...PLACE_KINDS] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-sm", kind === k ? "bg-primary font-semibold text-primary-foreground" : "bg-muted text-muted-foreground")}
          >
            {k === "ALL" ? t("places.all") : t(`places.kind.${k}`)}
          </button>
        ))}
      </div>
      <p className="px-1 text-xs text-muted-foreground">{t("places.sortedFrom", { place: location.label })}</p>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <Card className="items-center gap-2 px-6 py-8 text-center">
          <LandmarkIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t(data?.length ? "places.noMatch" : "places.empty")}</p>
          <p className="text-sm text-muted-foreground">{t("places.emptyHint")}</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => {
            const Icon = ICONS[p.kind]
            return (
              <li key={p.id}>
                <Card className="gap-2 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TONES[p.kind])} aria-hidden>
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(`places.kind.${p.kind}`)}
                        {p.province ? ` · ${p.province}` : ""}
                        {p.km != null ? ` · ${p.km < 10 ? p.km.toFixed(1) : Math.round(p.km)} km` : ""}
                      </p>
                      {p.address && <p className="mt-0.5 text-sm text-muted-foreground">{p.address}</p>}
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {p.halal_certified && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            <BadgeCheckIcon className="size-3.5" aria-hidden />
                            {t("places.certified")}
                          </span>
                        )}
                        {!p.approved && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            <ClockIcon className="size-3.5" aria-hidden />
                            {t("places.pending")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline" className="flex-1">
                      <a href={mapsUrl(p)} target="_blank" rel="noopener noreferrer">
                        <MapIcon />
                        {t("places.openMap")}
                      </a>
                    </Button>
                    {p.phone && (
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>
                          <PhoneIcon />
                          {t("places.call")}
                        </a>
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Button type="button" variant="secondary" className="w-full" onClick={() => setSuggestOpen(true)}>
        <PlusIcon />
        {t("places.suggest")}
      </Button>
      <PlaceFormSheet open={suggestOpen} onOpenChange={setSuggestOpen} />
    </div>
  )
}
