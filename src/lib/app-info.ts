"use client"

import { useQuery } from "@tanstack/react-query"

import { getSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * App identity for Settings › About and the Settings footer. The defaults
 * live here; an admin can override the text and links in /admin › About
 * (stored in app_settings "about_info"), without a new release.
 */
export const APP_VERSION = "1.0.0"
/** First year of the copyright notice ("© 2026", later "© 2026–2027"). */
export const COPYRIGHT_SINCE = 2026

export function copyrightYears(now: Date = new Date()): string {
  const year = now.getFullYear()
  return year > COPYRIGHT_SINCE ? `${COPYRIGHT_SINCE}–${year}` : String(COPYRIGHT_SINCE)
}

export type AboutInfo = {
  /** "Powered by: …" */
  developer: string
  /** Founders & developers, one per line, e.g. "Sou Chenda — Founder". */
  credits: string
  mission_km: string
  mission_en: string
  website: string
  email: string
  facebook: string
}

export const DEFAULT_ABOUT: AboutInfo = {
  developer: "iBMS",
  credits: "",
  mission_km: "កម្មវិធីគ្រប់គ្រងហិរញ្ញវត្ថុ និងបំណុលឆ្លាតវៃ សម្រាប់ប្រជាជនកម្ពុជា។",
  mission_en: "A smart money and debt manager made for the people of Cambodia.",
  website: "https://luy.ibmserp.com",
  email: "",
  facebook: "",
}

export function useAboutInfo(): AboutInfo {
  const { data } = useQuery({
    queryKey: ["about-info"],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return {}
      const { data } = await supabase.from("app_settings").select("value").eq("key", "about_info").maybeSingle()
      return (data?.value ?? {}) as Partial<AboutInfo>
    },
  })
  // Empty admin fields fall back to the defaults.
  const merged = { ...DEFAULT_ABOUT }
  for (const [k, v] of Object.entries(data ?? {})) if (typeof v === "string" && v.trim()) merged[k as keyof AboutInfo] = v.trim()
  return merged
}
