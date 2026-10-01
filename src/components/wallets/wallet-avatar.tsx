import { BanknoteIcon, WalletIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { getProvider } from "@/lib/wallets/providers"

/** Dark text on light brand colours (e.g. Wing's lime), white otherwise. */
function textColorFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.6 ? "#1a2e05" : "#ffffff"
}

export function WalletAvatar({ icon, color, className }: { icon: string | null; color?: string | null; className?: string }) {
  const provider = getProvider(icon)
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
      {provider.mark || (provider.key === "cash" ? <BanknoteIcon className="size-5" /> : <WalletIcon className="size-5" />)}
    </span>
  )
}
