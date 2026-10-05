import { CreditCardIcon, HandshakeIcon, MoonStarIcon, PiggyBankIcon, StoreIcon } from "lucide-react"

import type { TipTopic } from "@/lib/tips"
import { cn } from "@/lib/utils"

/** Vector icon + accent per tip topic (emoji render differently on every phone). */
const TOPIC_ICON: Record<TipTopic, { icon: typeof PiggyBankIcon; tone: string }> = {
  saving: { icon: PiggyBankIcon, tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
  debt: { icon: HandshakeIcon, tone: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400" },
  credit: { icon: CreditCardIcon, tone: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" },
  business: { icon: StoreIcon, tone: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
  islamic: { icon: MoonStarIcon, tone: "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400" },
}

/** The topic's icon in a soft rounded tile (size via className, e.g. "size-10" with iconClassName "size-5"). */
export function TopicIcon({ topic, className, iconClassName }: { topic: TipTopic; className?: string; iconClassName?: string }) {
  const { icon: Icon, tone } = TOPIC_ICON[topic]
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-xl", tone, className)} aria-hidden>
      <Icon className={cn("size-4", iconClassName)} strokeWidth={1.75} />
    </span>
  )
}
