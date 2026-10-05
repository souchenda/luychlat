import { BanknoteIcon, WalletIcon } from "lucide-react"

import { goalEmoji } from "@/lib/goals"
import { cn } from "@/lib/utils"
import { getProvider, nameMark, providerForName } from "@/lib/wallets/providers"

/** Dark text on light brand colours (e.g. Wing's lime), white otherwise. */
function textColorFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.6 ? "#1a2e05" : "#ffffff"
}

/**
 * The bank's logo when we have it (public/banks), else its brand mark on its
 * colour; for a wallet the user named themselves ("Other"), the first letters of its name.
 */
export function WalletAvatar({
  icon,
  color,
  name,
  className,
}: {
  icon: string | null
  color?: string | null
  name?: string
  className?: string
}) {
  // Savings goals show their emoji (🏠, 🚗, 🐑…).
  if (icon?.startsWith("goal_")) {
    return (
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-lg", className)} aria-hidden>
        {goalEmoji(icon)}
      </span>
    )
  }
  // A wallet without a bank picked ("Other") still gets its bank's logo when its name says which.
  const picked = getProvider(icon)
  const provider = picked.key === "other" ? (providerForName(name) ?? picked) : picked
  if (provider.logo) {
    return (
      <span className={cn("flex size-10 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-black/5", className)} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- small static brand files, no optimisation needed */}
        <img src={provider.logo} alt="" className="size-full object-cover" loading="lazy" decoding="async" draggable={false} />
      </span>
    )
  }
  const custom = provider.key === "other" && name ? nameMark(name) : ""
  const background = color ?? provider.color
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold tracking-tight",
        className,
      )}
      style={{ backgroundColor: background, color: textColorFor(background) }}
      aria-hidden
    >
      {custom || provider.mark || (provider.key === "cash" ? <BanknoteIcon className="size-5" /> : <WalletIcon className="size-5" />)}
    </span>
  )
}
