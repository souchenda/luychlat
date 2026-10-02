"use client"

import { Building2Icon } from "lucide-react"

import { useImageUrl } from "@/lib/profile"
import { cn } from "@/lib/utils"

/** Up to two initials: "Sou Chenda" → "SC", "ចិន្តា" → "ចិ" (whole Khmer letter clusters). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  const first = (w: string) => seg.segment(w)[Symbol.iterator]().next().value?.segment ?? ""
  if (!words.length) return "?"
  return (words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0])).toUpperCase()
}

/** Round photo, or initials on a gradient when there is no photo (a building icon for an unnamed business). */
export function ProfileAvatar({
  path,
  name,
  business,
  preview,
  className,
}: {
  path?: string | null
  name: string
  business?: boolean
  /** Local object URL of a photo picked but not saved yet. */
  preview?: string | null
  className?: string
}) {
  const url = useImageUrl(preview ? null : path)
  const src = preview ?? url
  return (
    <span
      className={cn(
        "relative flex size-12 shrink-0 items-center justify-center overflow-hidden text-base font-bold text-white shadow-sm",
        business ? "rounded-2xl bg-linear-to-br from-sky-600 to-indigo-700" : "rounded-full bg-linear-to-br from-emerald-500 to-teal-600",
        className,
      )}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
        <img src={src} alt="" className="size-full object-cover" />
      ) : business && !name.trim() ? (
        <Building2Icon className="size-1/2" />
      ) : (
        initials(name)
      )}
    </span>
  )
}
