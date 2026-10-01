import { cn } from "@/lib/utils"

/** App logo: a coin with the Riel sign. Mirrors public/icon.svg. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-12 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground shadow-sm",
        className,
      )}
      aria-hidden
    >
      ៛
    </div>
  )
}
