import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * The app's logo: the official mascot (public/logo.png, 256 px — founder, 11/10/2026). Sized and
 * rounded by `className` (size-*, rounded-*); decorative, the name is always written next to it.
 * `islamic`: the mascot in a white-and-gold kopiah (public/icon-islamic.png, scripts/generate-islamic-logo.mjs),
 * shown while Islamic Mode is on (founder, 18/10/2026).
 */
export function BrandMark({ className, priority, islamic }: { className?: string; priority?: boolean; islamic?: boolean }) {
  return (
    <span className={cn("relative block size-12 shrink-0 overflow-hidden rounded-2xl shadow-sm", className)} aria-hidden>
      <Image src={islamic ? "/icon-islamic.png" : "/logo.png"} alt="" fill sizes="96px" priority={priority} unoptimized className="object-cover" draggable={false} />
    </span>
  )
}
