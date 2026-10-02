"use client"

import { BadgeCheckIcon, ClockIcon, LandmarkIcon, ListIcon, MapIcon, MapPinnedIcon, PhoneIcon, SearchIcon, TentIcon, UtensilsIcon, type LucideIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { useIslamicLocation } from "@/components/islamic/location-picker"
import { OsmMap, type MapMarker } from "@/components/islamic/osm-map"
import { PlaceFormSheet } from "@/components/islamic/place-form-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/lib/i18n/use-t"
import { mapsUrl, PLACE_KINDS, usePlacePhotoUrl, usePlaces, type IslamicPlace, type PlaceKind } from "@/lib/places"
import { distanceKm } from "@/lib/prayer"
import { cn } from "@/lib/utils"

const ICONS: Record<PlaceKind, LucideIcon> = { MOSQUE: LandmarkIcon, SURAU: TentIcon, HALAL: UtensilsIcon }
const TONES: Record<PlaceKind, string> = {
  MOSQUE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  SURAU: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  HALAL: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
}

function PlacePhoto({ path }: { path: string }) {
  const url = usePlacePhotoUrl(path)
  if (!url) return null
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
  return <img src={url} alt="" className="mb-2 aspect-video w-full rounded-lg object-cover" loading="lazy" />
}

/** Searchable list (or OpenStreetMap map) of mosques, surau and halal food, nearest first. Places are added by admins or suggested by the community and approved by an admin. */
export default function PlacesPage() {
  const t = useT()
  const location = useIslamicLocation()
  const { data, isLoading } = usePlaces()
  const [kind, setKind] = useState<PlaceKind | "ALL">("ALL")
  const [query, setQuery] = useState("")
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [view, setView] = useState<"LIST" | "MAP">("LIST")
  const [selected, setSelected] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? [])
      .filter((p) => (kind === "ALL" || p.kind === kind) && (!q || [p.name, p.province, p.address].some((v) => v?.toLowerCase().includes(q))))
      .map((p) => ({ ...p, km: p.lat != null && p.lng != null ? distanceKm(location, { lat: p.lat, lng: p.lng }) : null }))
      .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.name.localeCompare(b.name))
  }, [data, kind, query, location])
  const markers = useMemo<MapMarker[]>(
    () => rows.flatMap((p) => (p.lat != null && p.lng != null ? [{ id: p.id, lat: p.lat, lng: p.lng, tone: p.approved ? p.kind : "PENDING", title: p.name }] : [])),
    [rows],
  )

  const card = (p: IslamicPlace & { km: number | null }) => {
    const Icon = ICONS[p.kind]
    return (
      <Card className={cn("gap-2 px-4 py-3", p.id === selected && "ring-2 ring-primary")}>
        {p.photo_path && <PlacePhoto path={p.photo_path} />}
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
    )
  }
  const chosen = rows.find((p) => p.id === selected)

  return (
    <div className="space-y-3">
      <Button type="button" className="h-11 w-full" onClick={() => setSuggestOpen(true)}>
        <MapPinnedIcon />
        {t("places.addSpot")}
      </Button>
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
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 px-1 text-xs text-muted-foreground">{t("places.sortedFrom", { place: location.label })}</p>
        <div className="w-36 shrink-0">
          <Segmented
            aria-label={t("places.view")}
            value={view}
            onChange={(v) => setView(v as "LIST" | "MAP")}
            options={[
              { value: "LIST", label: <ListIcon className="size-4" aria-label={t("places.list")} /> },
              { value: "MAP", label: <MapIcon className="size-4" aria-label={t("places.map")} /> },
            ]}
          />
        </div>
      </div>

      {view === "MAP" && (
        <div className="space-y-2">
          <div className="h-[55vh] min-h-72 overflow-hidden rounded-xl border">
            <OsmMap
              className="h-full w-full"
              center={chosen?.lat != null && chosen.lng != null ? { lat: chosen.lat, lng: chosen.lng } : { lat: location.lat, lng: location.lng }}
              zoom={12}
              markers={markers}
              selectedId={selected}
              onSelect={setSelected}
              me={location.gps ? { lat: location.lat, lng: location.lng } : null}
            />
          </div>
          {chosen ? card(chosen) : <p className="px-1 text-xs text-muted-foreground">{t(markers.length ? "places.tapMarker" : "places.noPins")}</p>}
        </div>
      )}

      {view === "LIST" &&
        (isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : rows.length === 0 ? (
          <Card className="items-center gap-2 px-6 py-8 text-center">
            <LandmarkIcon className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">{t(data?.length ? "places.noMatch" : "places.empty")}</p>
            <p className="text-sm text-muted-foreground">{t("places.emptyHint")}</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {rows.map((p) => (
              <li key={p.id}>{card(p)}</li>
            ))}
          </ul>
        ))}

      <p className="px-1 text-center text-[11px] text-muted-foreground">{t("places.communityNote")}</p>
      <PlaceFormSheet open={suggestOpen} onOpenChange={setSuggestOpen} />
    </div>
  )
}
