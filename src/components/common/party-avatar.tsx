import type { InstitutionCategory } from "@/lib/institution-logos"
import { resolveParty } from "@/lib/institutions"
import { cn } from "@/lib/utils"

/**
 * Who a debt, bill or vehicle document is with: the institution's official logo (rounded square,
 * white tile — as the Chip Mong goal on Home), else its badge in the category's colour, or a
 * person's coloured initial in a circle. Never a grey silhouette or an emoji.
 */
export function PartyAvatar({ name, category, className }: { name: string; category?: InstitutionCategory; className?: string }) {
  const p = resolveParty(name, category)
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
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl font-bold tracking-tight text-white shadow-sm ring-1 ring-black/5",
          p.mark.length > 2 ? "text-[11px]" : "text-base",
          className,
        )}
        style={{ backgroundImage: `linear-gradient(135deg, ${p.bg}, color-mix(in oklab, ${p.bg} 70%, black))` }}
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
