import { create } from "zustand"
import { persist } from "zustand/middleware"

/**
 * On-device only (never sent to the server): where to calculate prayer times
 * and the Qibla for, and the tasbih counter.
 */
type IslamicLocalState = {
  /** A province key from lib/prayer PROVINCES, or "gps" for the last device location. */
  place: string
  gps: { lat: number; lng: number } | null
  tasbihCount: number
  tasbihTarget: number
  tasbihPhrase: number
  /** Prayer-time alerts on this device, and the sound they play. */
  alertsOn: boolean
  alertSound: AlertSound
  /** Name of the Adhan file picked from the phone (the audio itself is in IndexedDB). */
  adhanName: string | null
  /** A built-in preset id (lib/adhan-presets) or "custom" for the file from the phone. */
  adhanPreset: string
  /** Quran reader: where the user stopped, text size, and whether the Khmer translation shows. */
  quranLast: { sura: number; aya: number } | null
  quranFontSize: number
  quranShowKm: boolean
  /** Play the Fajr Adhan ("As-salatu khayrun minan-nawm") at Fajr when it is available. */
  fajrAdhan: boolean
  setProvince: (key: string) => void
  setGps: (lat: number, lng: number) => void
  setTasbih: (patch: Partial<Pick<IslamicLocalState, "tasbihCount" | "tasbihTarget" | "tasbihPhrase">>) => void
  setQuran: (patch: Partial<Pick<IslamicLocalState, "quranLast" | "quranFontSize" | "quranShowKm">>) => void
  setAlerts: (patch: Partial<Pick<IslamicLocalState, "alertsOn" | "alertSound" | "adhanName" | "adhanPreset" | "fajrAdhan">>) => void
}

export type AlertSound = "adhan" | "chime" | "silent"

export const useIslamicLocalStore = create<IslamicLocalState>()(
  persist(
    (set) => ({
      place: "phnom_penh",
      gps: null,
      tasbihCount: 0,
      tasbihTarget: 33,
      tasbihPhrase: 0,
      alertsOn: false,
      alertSound: "chime",
      adhanName: null,
      adhanPreset: "makkah",
      fajrAdhan: true,
      quranLast: null,
      quranFontSize: 28,
      quranShowKm: true,
      setProvince: (key) => set({ place: key }),
      // Rounded to ~1 km: enough for prayer times, and less precise than a home address.
      setGps: (lat, lng) => set({ place: "gps", gps: { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 } }),
      setTasbih: (patch) => set(patch),
      setAlerts: (patch) => set(patch),
      setQuran: (patch) => set(patch),
    }),
    { name: "luychlat-islamic-local" },
  ),
)
