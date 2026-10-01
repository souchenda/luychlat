"use client"

import { CircleHelpIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import type { GuideSection } from "@/lib/guide/content"
import { useT } from "@/lib/i18n/use-t"

/** "Need help?" icon that opens the User Guide at one section. */
export function HelpLink({ section }: { section: GuideSection["id"] }) {
  const t = useT()
  return (
    <Button asChild size="icon" variant="ghost" className="shrink-0 text-muted-foreground" aria-label={t("guide.needHelp")}>
      <Link href={`/guide#${section}`}>
        <CircleHelpIcon />
      </Link>
    </Button>
  )
}
