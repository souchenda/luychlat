"use client"

import { useCallback } from "react"

import { useLocaleStore } from "@/stores/locale-store"

import { dictionaries, type MessageKey } from "./dictionaries"

export type TFunction = (key: MessageKey, params?: Record<string, string | number>) => string

/**
 * Always Khmer, whatever the app's language — for the community forms of the Islamic pages, where a member who left
 * the app in English could not read the qasidah form's messages (founder, 19/10/2026).
 */
export function useKhmerT(): TFunction {
  return useCallback((key, params) => {
    let text: string = dictionaries.km[key]
    if (params) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value))
    return text
  }, [])
}

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
