"use client"

import { useEffect, useState } from "react"

const dayOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** Today's date; updates after midnight and when the app returns to the foreground on a new day. */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    const refresh = () => setToday((prev) => (dayOf(prev) === dayOf(new Date()) ? prev : new Date()))
    const id = setInterval(refresh, 60_000)
    const onVisible = () => document.visibilityState === "visible" && refresh()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  return today
}
