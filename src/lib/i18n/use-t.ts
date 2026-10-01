"use client"

import { useCallback } from "react"

import { useLocaleStore } from "@/stores/locale-store"

import { dictionaries, type MessageKey } from "./dictionaries"

export type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string

export function useT(): TFunction {
  const locale = useLocaleStore((s) => s.locale)
  return useCallback(
    (key, params) => {
      let text: string = dictionaries[locale][key]
      if (params) {
        for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value))
      }
      return text
    },
    [locale],
  )
}
