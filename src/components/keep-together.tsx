import { BRAND_KEEP, splitKeep } from "@/lib/keep-together"

/** Text whose matching phrases (the brand by default) never break across lines. */
export function KeepTogether({ text, keep = BRAND_KEEP }: { text: string; keep?: RegExp }) {
  return (
    <>
      {splitKeep(text, keep).map((p, i) =>
        p.keep ? (
          <span key={i} className="whitespace-nowrap">
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </>
  )
}
