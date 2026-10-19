"use client"

import { BadgeCheckIcon, ClockIcon, LandmarkIcon, Loader2Icon, PhoneIcon, SearchIcon, TentIcon, UtensilsIcon, type LucideIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { locateDevice, useIslamicLocation } from "@/components/islamic/location-picker"
import { OsmMap, type MapMarker } from "@/components/islamic/osm-map"
import { SuggestPlaceSheet } from "@/components/islamic/suggest-place-sheet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { directionsUrl } from "@/lib/atm"
import { khmerDigits } from "@/lib/dates"
import { useKhmerT } from "@/lib/i18n/use-t"
import { PLACE_KINDS, usePlacePhotoUrl, usePlaces, type IslamicPlace, type PlaceKind } from "@/lib/places"
import { distanceKm } from "@/lib/prayer"
import { cn } from "@/lib/utils"

const ICONS: Record<PlaceKind, LucideIcon> = { MOSQUE: LandmarkIcon, SURAU: TentIcon, HALAL: UtensilsIcon }
const TONES: Record<PlaceKind, string> = {
  MOSQUE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  SURAU: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  HALAL: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
}
const PAGE = 20

function PlacePhoto({ path }: { path: string }) {
  const url = usePlacePhotoUrl(path)
  if (!url) return null
  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
  return <img src={url} alt="" className="mb-2 aspect-video w-full rounded-lg object-cover" loading="lazy" />
}

/** «១.២ គ.ម» / «៨ គ.ម» — Khmer digits. */
const kmText = (km: number) => `${khmerDigits(km < 10 ? km.toFixed(1) : String(Math.round(km)))} គ.ម`

type Row = IslamicPlace & { km: number | null }

/**
 * The Islamic places finder, like the ATM finder (founder, 19/10/2026): mosques, surau and halal food across Cambodia,
 * pre-loaded from OpenStreetMap (lib/islamic/places-osm.ts), on the map at once, nearest first — from the phone's
 * position after «📍 យកទីតាំងក្បែរខ្ញុំ», else from the Islamic pages' place. Tap a pin or a card: its details and
 * «🧭 នាំផ្លូវ». Suggesting a missing place is one optional button. Always in Khmer.
 */
export default function PlacesPage() {
  const t = useKhmerT()
  const location = useIslamicLocation()
  const { data, isLoading } = usePlaces()
  const [kind, setKind] = useState<PlaceKind | "ALL">("ALL")
  const [query, setQuery] = useState("")
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)
  const [suggestOpen, setSuggestOpen] = useState(false)

  const fromLat = me?.lat ?? location.lat
  const fromLng = me?.lng ?? location.lng
  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase()
    return (data ?? [])
      .filter((p) => (kind === "ALL" || p.kind === kind) && (!q || [p.name, p.province, p.address].some((v) => v?.toLowerCase().includes(q))))
      .map((p) => ({ ...p, km: p.lat != null && p.lng != null ? distanceKm({ lat: fromLat, lng: fromLng }, { lat: p.lat, lng: p.lng }) : null }))
      .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity) || a.name.localeCompare(b.name))
  }, [data, kind, query, fromLat, fromLng])
  const markers = useMemo<MapMarker[]>(
    () => rows.flatMap((p) => (p.lat != null && p.lng != null ? [{ id: p.id, lat: p.lat, lng: p.lng, tone: p.approved ? p.kind : "PENDING", title: p.name }] : [])),
    [rows],
  )
  const chosen = rows.find((p) => p.id === selected) ?? null

  const nearMe = async () => {
    setLocating(true)
    const result = await locateDevice()
    setLocating(false)
    if (!result.ok) return void toast.error(t(result.reason === "denied" ? "finder.gpsDenied" : "finder.gpsFailed"))
    setMe({ lat: result.lat, lng: result.lng })
    setSelected(null)
    setShown(PAGE)
  }

  const details = (p: Row, compact = false) => {
    const Icon = ICONS[p.kind]
    return (
      <Card className={cn("gap-2 px-4 py-3", p.id === selected && "ring-2 ring-primary")}>
        {!compact && p.photo_path && <PlacePhoto path={p.photo_path} />}
        <button type="button" className="flex items-start gap-3 text-left" onClick={() => setSelected(p.id)}>
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TONES[p.kind])} aria-hidden>
            <Icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{p.name}</span>
            <span className="block text-xs text-muted-foreground">
              {t(`finder.kind.${p.kind}`)}
              {p.km != null ? ` · ${kmText(p.km)}` : ""}
              {p.province ? ` · ${p.province}` : ""}
            </span>
            {p.address && <span className="mt-0.5 block text-sm text-muted-foreground">{p.address}</span>}
            {(p.halal_certified || !p.approved) && (
              <span className="mt-1 flex flex-wrap gap-1.5">
                {p.halal_certified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    <BadgeCheckIcon className="size-3.5" aria-hidden />
                    {t("finder.certified")}
                  </span>
                )}
                {!p.approved && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    <ClockIcon className="size-3.5" aria-hidden />
                    {t("finder.pending")}
                  </span>
                )}
              </span>
            )}
          </span>
        </button>
        {p.lat != null && p.lng != null && (
          <div className="flex gap-2">
            <Button asChild size="sm" className="h-10 flex-1">
              <a href={directionsUrl(p.lat, p.lng)} target="_blank" rel="noopener noreferrer">
                {t("finder.directions")}
              </a>
            </Button>
            {p.phone && (
              <Button asChild size="sm" variant="outline" className="h-10">
                <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} aria-label={t("finder.call")}>
                  <PhoneIcon />
                </a>
              </Button>
            )}
          </div>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 px-1 text-xs text-muted-foreground">
          {t("finder.count", { count: khmerDigits(String(rows.length)) })} · {t("finder.nearestFrom", { place: me ? t("finder.myPlace") : location.label })}
        </p>
        <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => void nearMe()} disabled={locating}>
          {locating && <Loader2Icon className="animate-spin" />}
          {t("finder.nearMe")}
        </Button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(["ALL", ...PLACE_KINDS] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k)
              setSelected(null)
              setShown(PAGE)
            }}
            aria-pressed={kind === k}
            className={cn("min-h-9 shrink-0 rounded-full px-3 py-1.5 text-sm", kind === k ? "bg-primary font-semibold text-primary-foreground" : "bg-muted text-muted-foreground")}
          >
            {t(`finder.chip.${k}`)}
          </button>
        ))}
      </div>

      {/* The pins, at once — the map has a fixed height and keeps its layers to itself. */}
      <div className="isolate h-[42vh] min-h-64 overflow-hidden rounded-xl border">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <OsmMap
            className="h-full w-full"
            center={chosen?.lat != null && chosen.lng != null ? { lat: chosen.lat, lng: chosen.lng } : { lat: fromLat, lng: fromLng }}
            zoom={me ? 13 : 11}
            markers={markers}
            selectedId={selected}
            onSelect={setSelected}
            me={me ?? (location.gps ? { lat: location.lat, lng: location.lng } : null)}
          />
        )}
      </div>
      {chosen && details(chosen)}

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("finder.search")} className="h-10 pl-9" aria-label={t("finder.search")} />
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <Card className="items-center gap-2 px-6 py-8 text-center">
          <LandmarkIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t("finder.none")}</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, shown).map((p) => (
            <li key={p.id}>{details(p, true)}</li>
          ))}
        </ul>
      )}
      {rows.length > shown && (
        <Button type="button" variant="ghost" className="h-10 w-full" onClick={() => setShown(shown + PAGE)}>
          {t("finder.more", { count: khmerDigits(String(rows.length - shown)) })}
        </Button>
      )}

      <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setSuggestOpen(true)}>
        {t("finder.suggest")}
      </Button>
      <p className="px-1 text-center text-[11px] text-muted-foreground">{t("finder.credit")}</p>
      <SuggestPlaceSheet open={suggestOpen} onOpenChange={setSuggestOpen} />
    </div>
  )
}
