"use client"

import { LanguagesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useHydrated } from "@/hooks/use-hydrated"
import { useLocaleStore } from "@/stores/locale-store"

export function LanguageToggle() {
  const hydrated = useHydrated()
  const { locale, setLocale } = useLocaleStore()

  return (
    <Button variant="ghost" size="sm" onClick={() => setLocale(locale === "km" ? "en" : "km")}>
      <LanguagesIcon />
      {hydrated ? (locale === "km" ? "English" : "ខ្មែរ") : "English"}
    </Button>
  )
}
