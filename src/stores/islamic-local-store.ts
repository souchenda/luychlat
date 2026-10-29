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
  /**
   * The place's name for «my location» (founder, 29/10/2026 — lib/place-name.ts), worked out on the phone from the full
   * fix and kept here only: «exact» from the phone's geocoder, «near» from the nearest known place; with its language.
   */
  gpsName: { name: string; kind: "exact" | "near"; locale: string } | null
  setGpsName: (name: IslamicLocalState["gpsName"]) => void
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
  /** The Quran reciter (lib/quran-audio QURAN_RECITERS), remembered on this device. */
  quranReciter: string
  /** Play the Fajr Adhan ("As-salatu khayrun minan-nawm") at Fajr when it is available. */
  fajrAdhan: boolean
  /** This phone's server prayer push paused because the GPS put it abroad (it rings by Cambodian province); resumed back home. */
  pushPausedAbroad: boolean
  setPushPausedAbroad: (on: boolean) => void
  /** «ស្ងាត់ SoundBox អំឡុងពេលសឡាត» on this device (Task #506 — off by default), and its minutes after each Adhan (15 / 20). */
  soundboxQuiet: boolean
  soundboxQuietMinutes: number
  setSoundboxQuiet: (patch: Partial<Pick<IslamicLocalState, "soundboxQuiet" | "soundboxQuietMinutes">>) => void
  setProvince: (key: string) => void
  setGps: (lat: number, lng: number) => void
  setTasbih: (patch: Partial<Pick<IslamicLocalState, "tasbihCount" | "tasbihTarget" | "tasbihPhrase">>) => void
  setQuran: (patch: Partial<Pick<IslamicLocalState, "quranLast" | "quranFontSize" | "quranShowKm" | "quranReciter">>) => void
  setAlerts: (patch: Partial<Pick<IslamicLocalState, "alertsOn" | "alertSound" | "adhanName" | "adhanPreset" | "fajrAdhan">>) => void
}

export type AlertSound = "adhan" | "chime" | "vibrate" | "silent"

export const useIslamicLocalStore = create<IslamicLocalState>()(
  persist(
    (set) => ({
      place: "phnom_penh",
      gps: null,
      gpsName: null,
      setGpsName: (gpsName) => set({ gpsName }),
      tasbihCount: 0,
      tasbihTarget: 33,
      tasbihPhrase: 0,
      alertsOn: false,
      alertSound: "chime",
      adhanName: null,
      adhanPreset: "makkah",
      fajrAdhan: true,
      pushPausedAbroad: false,
      setPushPausedAbroad: (on) => set({ pushPausedAbroad: on }),
      soundboxQuiet: false,
      soundboxQuietMinutes: 15,
      setSoundboxQuiet: (patch) => set(patch),
      quranLast: null,
      quranFontSize: 28,
      quranShowKm: true,
      quranReciter: "alafasy",
      setProvince: (key) => set({ place: key }),
      // Rounded to ~1 km: enough for prayer times, and less precise than a home address.
      // A new fix elsewhere drops the old name until the new one is found (never a name for another place).
      setGps: (lat, lng) =>
        set((s) => {
          const gps = { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 }
          const moved = !s.gps || s.gps.lat !== gps.lat || s.gps.lng !== gps.lng
          return { place: "gps", gps, ...(moved ? { gpsName: null } : {}) }
        }),
      setTasbih: (patch) => set(patch),
      setAlerts: (patch) => set(patch),
      setQuran: (patch) => set(patch),
    }),
    { name: "luychlat-islamic-local" },
  ),
)
