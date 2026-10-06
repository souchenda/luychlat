import {
  CookingPotIcon,
  DropletsIcon,
  FlameIcon,
  FlowerIcon,
  HandHeartIcon,
  MoonStarIcon,
  PartyPopperIcon,
  SailboatIcon,
  SoupIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"

import type { CulturalKey } from "@/lib/cultural-calendar"

/** Each festival / offering day's icon (pill, banner, /bills list). */
export const CULTURAL_ICON: Record<CulturalKey, LucideIcon> = {
  new_year: PartyPopperIcon,
  little_new_year: FlameIcon,
  cny_eve: CookingPotIcon,
  chinese_new_year: SparklesIcon,
  khmer_new_year: FlowerIcon,
  hungry_ghost: DropletsIcon,
  mid_autumn: MoonStarIcon,
  pchum_ben: HandHeartIcon,
  water_festival: SailboatIcon,
  dongzhi: SoupIcon,
}

const RED_GOLD = {
  card: "border-red-200/80 from-red-50 via-amber-50 to-red-100/70 dark:border-red-900/60 dark:from-red-500/15 dark:via-amber-500/10 dark:to-red-500/15",
  disc: "bg-red-600! text-amber-200",
  mark: "text-red-500/15",
}

/** Banner colours: Chinese days in red and gold, the rest in their own soft tones. */
export const CULTURAL_LOOK: Record<CulturalKey, { card: string; disc: string; mark: string }> = {
  new_year: {
    card: "border-emerald-200/70 from-emerald-50 via-amber-50 to-teal-50 dark:border-emerald-900/50 dark:from-emerald-500/10 dark:via-amber-500/10 dark:to-teal-500/10",
    disc: "text-emerald-600",
    mark: "text-emerald-500/15",
  },
  little_new_year: RED_GOLD,
  cny_eve: RED_GOLD,
  chinese_new_year: RED_GOLD,
  khmer_new_year: {
    card: "border-amber-200/70 from-amber-50 via-rose-50 to-emerald-50 dark:border-amber-900/50 dark:from-amber-500/10 dark:via-rose-500/10 dark:to-emerald-500/10",
    disc: "text-rose-500",
    mark: "text-amber-500/15",
  },
  hungry_ghost: RED_GOLD,
  mid_autumn: RED_GOLD,
  pchum_ben: {
    card: "border-amber-200/70 from-amber-50 via-orange-50 to-yellow-50 dark:border-amber-900/50 dark:from-amber-500/10 dark:via-orange-500/10 dark:to-yellow-500/10",
    disc: "text-amber-600",
    mark: "text-amber-500/15",
  },
  water_festival: {
    card: "border-sky-200/70 from-sky-50 via-indigo-50 to-amber-50 dark:border-sky-900/50 dark:from-sky-500/10 dark:via-indigo-500/10 dark:to-amber-500/10",
    disc: "text-sky-600",
    mark: "text-sky-500/15",
  },
  dongzhi: RED_GOLD,
}
