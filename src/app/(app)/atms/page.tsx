"use client"

import { ListIcon, Loader2Icon, LocateFixedIcon, MapIcon, NavigationIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Segmented } from "@/components/common/segmented"
import { locateDevice } from "@/components/islamic/location-picker"
import { OsmMap, type MapMarker } from "@/components/islamic/osm-map"
import { SettingsSubHeader } from "@/components/settings/settings-ui"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { BANKS, directionsUrl, nearest, type BankCode, type Near } from "@/lib/atm"
import { useBankAtms } from "@/lib/atms-query"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"
import { PROVINCES } from "@/lib/kh-towns"
import { cn } from "@/lib/utils"
import { useLocaleStore } from "@/stores/locale-store"

type Kind = "ALL" | "CASH" | "BRANCH"
const DOT: Record<BankCode, string> = { ABA: "bg-sky-600", ACLEDA: "bg-amber-500", CANADIA: "bg-red-600", WING: "bg-lime-500", SATHAPANA: "bg-violet-600" }

/** The nearest ATMs, deposit machines and branches of five banks (OpenStreetMap data), with Google Maps directions. */
export default function AtmsPage() {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { data, isLoading } = useBankAtms()
  const [from, setFrom] = useState<{ lat: number; lng: number; label: string; gps: boolean }>({ ...PROVINCES[0], label: PROVINCES[0].km, gps: false })
  const [bank, setBank] = useState<BankCode | "ALL">("ALL")
  const [kind, setKind] = useState<Kind>("ALL")
  const [view, setView] = useState<"LIST" | "MAP">("LIST")
  const [locating, setLocating] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const rows = useMemo(
    () => nearest(data ?? [], from, { bank: bank === "ALL" ? null : bank, type: kind === "ALL" ? null : kind, radiusKm: 10, limit: 30 }),
    [data, from, bank, kind],
  )
  const markers = useMemo<MapMarker[]>(() => rows.map((r) => ({ id: r.osm_ref, lat: r.latitude, lng: r.longitude, tone: "PIN", title: r.name_kh ?? r.name_en ?? r.bank_code })), [rows])
  const provinceName = (p: (typeof PROVINCES)[number]) => (locale === "km" ? p.km : p.en)

  async function locate() {
    setLocating(true)
    const r = await locateDevice()
    setLocating(false)
    if (r.ok) setFrom({ lat: r.lat, lng: r.lng, label: t("atm.myLocation"), gps: true })
    else toast.error(t(r.reason === "denied" ? "atm.locationDenied" : "atm.locationFailed"))
  }

  const card = (r: Near) => {
    const label = BANKS.find((b) => b.code === r.bank_code)!.label
    const name = (locale === "km" ? (r.name_kh ?? r.name_en) : (r.name_en ?? r.name_kh)) ?? label
    const area = locale === "km" ? (r.province_km ?? r.province) : (r.province ?? r.province_km)
    return (
      <Card className={cn("gap-2 px-4 py-3", r.osm_ref === selected && "ring-2 ring-primary")}>
        <div className="flex items-start gap-3">
          <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", DOT[r.bank_code])} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {label} · {t(`atm.type.${r.type}` as MessageKey)}
            </p>
            <p className="truncate text-sm">{name}</p>
            <p className="text-xs text-muted-foreground">
              {[r.address, area].filter(Boolean).join(" · ")}
              {r.currencies?.length ? ` · ${r.currencies.map((c) => (c === "USD" ? "$" : "៛")).join(" / ")}` : ""}
              {r.is_24h ? " · 24/7" : ""}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{r.distance_km < 1 ? `${Math.round(r.distance_km * 1000)} m` : `${r.distance_km.toFixed(1)} km`}</span>
        </div>
        <Button asChild size="sm" variant="outline">
          <a href={directionsUrl(r.latitude, r.longitude)} target="_blank" rel="noopener noreferrer">
            <NavigationIcon />
            {t("atm.directions")}
          </a>
        </Button>
      </Card>
    )
  }
  const chosen = rows.find((r) => r.osm_ref === selected)

  return (
    <div className="space-y-3">
      <SettingsSubHeader title={t("atm.title")} back="/home" />
      <Button type="button" className="h-11 w-full" onClick={locate} disabled={locating}>
        {locating ? <Loader2Icon className="animate-spin" /> : <LocateFixedIcon />}
        {t("atm.useLocation")}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={from.gps ? "" : from.label}
          onValueChange={(v) => {
            const p = PROVINCES.find((x) => x.km === v)
            if (p) setFrom({ lat: p.lat, lng: p.lng, label: p.km, gps: false })
          }}
        >
          <SelectTrigger aria-label={t("atm.province")} className="w-full">
            <SelectValue placeholder={from.gps ? t("atm.myLocation") : t("atm.province")} />
          </SelectTrigger>
          <SelectContent>
            {PROVINCES.map((p) => (
              <SelectItem key={p.km} value={p.km}>
                {provinceName(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={bank} onValueChange={(v) => setBank(v as BankCode | "ALL")}>
          <SelectTrigger aria-label={t("atm.bank")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("atm.allBanks")}</SelectItem>
            {BANKS.map((b) => (
              <SelectItem key={b.code} value={b.code}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Segmented
          className="min-w-0 flex-1"
          aria-label={t("atm.kind")}
          value={kind}
          onChange={setKind}
          options={[
            { value: "ALL", label: t("atm.kind.ALL") },
            { value: "CASH", label: t("atm.kind.CASH") },
            { value: "BRANCH", label: t("atm.kind.BRANCH") },
          ]}
        />
        <Segmented
          className="w-24 shrink-0"
          aria-label={t("atm.view")}
          value={view}
          onChange={setView}
          options={[
            { value: "LIST", label: <ListIcon className="mx-auto size-4" aria-label={t("atm.list")} /> },
            { value: "MAP", label: <MapIcon className="mx-auto size-4" aria-label={t("atm.map")} /> },
          ]}
        />
      </div>
      <p className="px-1 text-xs text-muted-foreground">{t("atm.within", { place: from.label })}</p>

      {view === "MAP" && (
        <div className="space-y-2">
          <div className="h-[55vh] min-h-72 overflow-hidden rounded-xl border">
            <OsmMap
              className="h-full w-full"
              center={chosen ? { lat: chosen.latitude, lng: chosen.longitude } : { lat: from.lat, lng: from.lng }}
              zoom={13}
              markers={markers}
              selectedId={selected}
              onSelect={setSelected}
              me={from.gps ? { lat: from.lat, lng: from.lng } : null}
            />
          </div>
          {chosen ? card(chosen) : <p className="px-1 text-xs text-muted-foreground">{t("atm.tapMarker")}</p>}
        </div>
      )}

      {view === "LIST" &&
        (isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : rows.length === 0 ? (
          <Card className="items-center gap-2 px-6 py-8 text-center">
            <p className="font-medium">{t("atm.none")}</p>
            <p className="text-sm text-muted-foreground">{t("atm.noneHint")}</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.osm_ref}>{card(r)}</li>
            ))}
          </ul>
        ))}

      <p className="px-1 text-center text-[11px] text-muted-foreground">{t("atm.attribution")}</p>
    </div>
  )
}
