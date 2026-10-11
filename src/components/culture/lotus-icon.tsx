import type { SVGProps } from "react"

/** A sacred lotus (ផ្កាឈូក) in the line style of the other icons — Pchum Ben and holy days. */
export function LotusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 20c-2.5-1.6-3.8-4.2-3.8-7.3 0-2.6 1.4-5.2 3.8-7.2 2.4 2 3.8 4.6 3.8 7.2 0 3.1-1.3 5.7-3.8 7.3Z" />
      <path d="M12 20c-3.6-.2-6.7-2-8.2-5.2 1.9-.9 4-.9 5.8 0" />
      <path d="M12 20c3.6-.2 6.7-2 8.2-5.2-1.9-.9-4-.9-5.8 0" />
      <path d="M5 21h14" />
    </svg>
  )
}
