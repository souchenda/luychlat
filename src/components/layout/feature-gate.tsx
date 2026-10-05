"use client"

import { Loader2Icon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect } from "react"
import { toast } from "sonner"

import { featureOfPath, useFeatures } from "@/lib/features"
import { useT } from "@/lib/i18n/use-t"

/**
 * Pages of a feature still in testing (ADMIN_ONLY / DISABLED): anyone not
 * allowed goes back to Home with a "coming soon" note. Other pages pass through.
 */
export function FeatureGate({ children }: { children: React.ReactNode }) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const feature = featureOfPath(pathname)
  const { ready, allowed } = useFeatures()
  const blocked = Boolean(feature && ready && !allowed(feature))

  useEffect(() => {
    if (!blocked) return
    toast(t("feature.comingSoon"), { id: "feature-soon" })
    router.replace("/home")
  }, [blocked, router, t])

  if (!feature) return children
  if (!ready) return <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
  return blocked ? null : children
}
