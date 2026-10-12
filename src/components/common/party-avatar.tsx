import { resolveParty } from "@/lib/institutions"
import { cn } from "@/lib/utils"

/**
 * Who a debt or bill is with: a bank / MFI's official logo (rounded square, white tile — as the Chip
 * Mong goal on Home), another institution's monogram tile, or a person's coloured initial in a
 * circle. Never a grey silhouette or a building emoji.
 */
export function PartyAvatar({ name, className }: { name: string; className?: string }) {
  const p = resolveParty(name)
  if (p.kind === "logo")
    return (
      <span className={cn("flex size-10 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-black/5", className)} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- small static brand files */}
        <img src={p.logo} alt="" className="size-full object-cover" loading="lazy" decoding="async" draggable={false} />
      </span>
    )
  if (p.kind === "institution")
    return (
      <span
        className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-slate-700 to-slate-900 text-[11px] font-bold tracking-tight text-white ring-1 ring-black/5", className)}
        aria-hidden
      >
        {p.mark}
      </span>
    )
  return (
    <span
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold text-white", className)}
      style={{ backgroundColor: `hsl(${p.hue} 55% 45%)` }}
      aria-hidden
    >
      {p.initial}
    </span>
  )
}

/** A bill's icon: the institution's logo / monogram when its title names one (PPCBank, CLC, EDC…), else the bill kind's emoji. */
export function BillIcon({ title, emoji, className }: { title: string; emoji: string; className?: string }) {
  if (resolveParty(title).kind !== "person") return <PartyAvatar name={title} className={className} />
  return (
    <span className={cn("flex shrink-0 items-center justify-center text-2xl", className)} aria-hidden>
      {emoji}
    </span>
  )
}
