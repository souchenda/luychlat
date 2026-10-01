import { create } from "zustand"
import { persist } from "zustand/middleware"

import type { Locale } from "@/lib/i18n/dictionaries"

type LocaleState = {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "km",
      setLocale: (locale) => set({ locale }),
    }),
    { name: "luysmart-locale" },
  ),
)
