"use client"

import { CameraIcon, Loader2Icon, LocateFixedIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { BottomSheet } from "@/components/common/bottom-sheet"
import { Segmented } from "@/components/common/segmented"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { locateDevice, useIslamicLocation } from "@/components/islamic/location-picker"
import { OsmMap } from "@/components/islamic/osm-map"
import { useT } from "@/lib/i18n/use-t"
import { parseLatLng, PLACE_KINDS, uploadPlacePhoto, usePlaceMutations, usePlacePhotoUrl, type IslamicPlace, type PlaceKind } from "@/lib/places"
import { PROVINCES } from "@/lib/prayer"
import { useLocaleStore } from "@/stores/locale-store"
import { useSessionStore } from "@/stores/session-store"
import { pick as pickText } from "@/lib/i18n/dictionaries"

/**
 * Suggest a place (users: waits for an admin) or add / edit one (admins:
 * listed at once, may mark it halal-certified).
 */
export function PlaceFormSheet({
  open,
  onOpenChange,
  admin,
  place,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  admin?: boolean
  /** Edit this place (admin only). */
  place?: IslamicPlace | null
}) {
  const t = useT()
  const locale = useLocaleStore((s) => s.locale)
  const { add, update } = usePlaceMutations()
  const [kind, setKind] = useState<PlaceKind>("MOSQUE")
  const [name, setName] = useState("")
  const [province, setProvince] = useState("")
  const [address, setAddress] = useState("")
  const [coords, setCoords] = useState("")
  const [phone, setPhone] = useState("")
  const [note, setNote] = useState("")
  const [certified, setCertified] = useState(false)
  const [locating, setLocating] = useState(false)
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const userId = useSessionStore((s) => s.user?.id ?? null)
  const savedPhotoUrl = usePlacePhotoUrl(photoFile ? null : photoPath)
  const around = useIslamicLocation()

  useEffect(() => {
    if (!open) return
    setKind(place?.kind ?? "MOSQUE")
    setName(place?.name ?? "")
    setProvince(place?.province ?? "")
    setAddress(place?.address ?? "")
    setCoords(place?.lat != null && place.lng != null ? `${place.lat}, ${place.lng}` : "")
    setPhone(place?.phone ?? "")
    setNote(place?.note ?? "")
    setCertified(place?.halal_certified ?? false)
    setPhotoPath(place?.photo_path ?? null)
    setPhotoFile(null)
    setPhotoPreview(null)
  }, [open, place])

  useEffect(() => () => void (photoPreview && URL.revokeObjectURL(photoPreview)), [photoPreview])
  const point = parseLatLng(coords)
  const pick = (p: { lat: number; lng: number }) => setCoords(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`)
  const choosePhoto = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) return void toast.error(t("debtPhotos.notImage"))
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const here = async () => {
    setLocating(true)
    const result = await locateDevice()
    setLocating(false)
    if (result.ok) pick(result)
    else toast.error(t(result.reason === "denied" ? "prayer.gpsDenied" : result.reason === "unavailable" ? "prayer.gpsTimeout" : "prayer.gpsUnavailable"))
  }

  const busy = add.isPending || update.isPending || uploading
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return void toast.error(t("places.nameRequired"))
    if (coords.trim() && !point) return void toast.error(t("places.coordsInvalid"))
    let photo = photoPath
    if (photoFile && userId) {
      setUploading(true)
      try {
        photo = await uploadPlacePhoto(photoFile, userId)
      } catch {
        setUploading(false)
        return void toast.error(t("common.error"))
      }
      setUploading(false)
    }
    const input = {
      kind,
      name: name.trim(),
      province: province || null,
      address: address.trim() || null,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      phone: phone.trim() || null,
      note: note.trim() || null,
      // Only sent when there is (or was) a photo, so saving works before the photo migration.
      ...(photo || place?.photo_path ? { photo_path: photo } : {}),
      ...(admin ? { halal_certified: kind === "HALAL" && certified, approved: true } : {}),
    }
    const onSuccess = () => {
      toast.success(t(admin ? "places.saved" : "places.suggested"))
      onOpenChange(false)
    }
    const onError = (error: Error) => toast.error(error.message.includes("too many") ? t("places.tooMany") : t("common.error"))
    if (place) update.mutate({ id: place.id, patch: input }, { onSuccess, onError })
    else add.mutate(input, { onSuccess, onError })
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t(place ? "places.edit" : admin ? "places.add" : "places.suggest")} description={admin ? undefined : t("places.suggestHint")}>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Segmented
          aria-label={t("places.kind")}
          value={kind}
          onChange={(v) => setKind(v as PlaceKind)}
          options={PLACE_KINDS.map((k) => ({ value: k, label: t(`places.kind.${k}`) }))}
        />
        <div className="space-y-1.5">
          <Label htmlFor="place-name">{t("places.name")}</Label>
          <Input id="place-name" className="h-11" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("places.province")}</Label>
          <Select value={province || undefined} onValueChange={setProvince}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder={t("places.provincePick")} />
            </SelectTrigger>
            <SelectContent>
              {PROVINCES.map((p) => (
                <SelectItem key={p.key} value={p.km}>
                  {pickText(p, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="place-address">{t("places.address")}</Label>
          <Textarea id="place-address" rows={2} maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label>{t("places.pin")}</Label>
            <Button type="button" size="sm" variant="outline" onClick={() => void here()} disabled={locating}>
              {locating ? <Loader2Icon className="animate-spin" /> : <LocateFixedIcon />}
              {t("places.useHere")}
            </Button>
          </div>
          <div className="h-56 overflow-hidden rounded-xl border">
            <OsmMap
              className="h-full w-full"
              center={point ?? { lat: around.lat, lng: around.lng }}
              zoom={point ? 16 : 13}
              markers={point ? [{ id: "pin", lat: point.lat, lng: point.lng, tone: "PIN", title: name || t("places.pin") }] : []}
              onPick={pick}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t(point ? "places.pinSet" : "places.pinHint")}</p>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">{t("places.pasteCoords")}</summary>
            <Input id="place-coords" className="mt-1.5 h-10" placeholder="11.5564, 104.9282" value={coords} onChange={(e) => setCoords(e.target.value)} aria-label={t("places.coords")} />
            <p className="mt-1 text-muted-foreground">{t("places.coordsHint")}</p>
          </details>
        </div>

        <div className="space-y-1.5">
          <Label>{t("places.photo")}</Label>
          {photoPreview || savedPhotoUrl ? (
            <div className="relative aspect-video overflow-hidden rounded-xl border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview or short-lived signed URL */}
              <img src={photoPreview ?? savedPhotoUrl!} alt="" className="size-full object-cover" />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute top-2 right-2 size-8 rounded-full"
                onClick={() => {
                  setPhotoFile(null)
                  setPhotoPreview(null)
                  setPhotoPath(null)
                }}
                aria-label={t("debtPhotos.remove")}
              >
                <XIcon />
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="h-11 w-full" onClick={() => fileRef.current?.click()}>
              <CameraIcon />
              {t("places.addPhoto")}
            </Button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => choosePhoto(e.target.files?.[0])} aria-label={t("places.addPhoto")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="place-phone">{t("places.phone")}</Label>
          <Input id="place-phone" className="h-11" type="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="place-note">{t("places.note")}</Label>
          <Textarea id="place-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {admin && kind === "HALAL" && (
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm">
            {t("places.certified")}
            <Switch checked={certified} onCheckedChange={setCertified} />
          </label>
        )}
        <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
          {busy && <Loader2Icon className="animate-spin" />}
          {t(admin || place ? "common.save" : "places.send")}
        </Button>
      </form>
    </BottomSheet>
  )
}
