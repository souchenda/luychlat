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
  setProvince: (key: string) => void
  setGps: (lat: number, lng: number) => void
  setTasbih: (patch: Partial<Pick<IslamicLocalState, "tasbihCount" | "tasbihTarget" | "tasbihPhrase">>) => void
  setAlerts: (patch: Partial<Pick<IslamicLocalState, "alertsOn" | "alertSound" | "adhanName">>) => void
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
      setProvince: (key) => set({ place: key }),
      // Rounded to ~1 km: enough for prayer times, and less precise than a home address.
      setGps: (lat, lng) => set({ place: "gps", gps: { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 } }),
      setTasbih: (patch) => set(patch),
      setAlerts: (patch) => set(patch),
    }),
    { name: "luychlat-islamic-local" },
  ),
)
