"use client"

import { Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { useHydrated } from "@/hooks/use-hydrated"
import { useSessionStore } from "@/stores/session-store"

export default function IndexPage() {
  const router = useRouter()
  const hydrated = useHydrated()
  const { user, isGuest, authReady } = useSessionStore()

  useEffect(() => {
    if (!hydrated) return
    if (isGuest || user) router.replace("/home")
    else if (authReady) router.replace("/login")
  }, [hydrated, user, isGuest, authReady, router])

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}
