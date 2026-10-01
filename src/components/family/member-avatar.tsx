"use client"

import { useActiveWorkspace, useMembers, useProfile } from "@/lib/data/hooks"
import type { Attribution } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"
import { cn } from "@/lib/utils"

// Fixed hue order; a person keeps their colour because it follows their id, not their position.
const TONES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
]

function toneFor(key: string) {
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[hash % TONES.length]
}

/** First visible letter (works for Khmer clusters and Latin names alike). */
function initial(name: string) {
  const trimmed = name.replace(/^[\s(]+/, "")
  if (!trimmed) return "?"
  if (typeof Intl.Segmenter === "function") {
    const first = new Intl.Segmenter().segment(trimmed)[Symbol.iterator]().next().value
    if (first) return first.segment.toUpperCase()
  }
  return trimmed.charAt(0).toUpperCase()
}

export function MemberAvatar({ id, name, className }: { id: string | null; name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        toneFor(id ?? name),
        className,
      )}
    >
      {initial(name)}
    </span>
  )
}

/**
 * Who-recorded-it resolver for the active workspace: the member's current
 * name when they are still a member, else the name saved on the row.
 * `enabled` is false outside a family workspace (it would always be "you").
 */
export function useAttribution() {
  const { workspace } = useActiveWorkspace()
  const enabled = workspace?.type === "FAMILY"
  const members = useMembers(enabled ? workspace.id : undefined).data
  const me = useProfile().data?.id
  const nameOf = (row: Attribution) =>
    members?.find((m) => m.user_id === row.created_by)?.display_name ?? row.created_by_name ?? null
  return { enabled, nameOf, isMe: (row: Attribution) => Boolean(me && row.created_by === me) }
}

/** "កត់ដោយ៖ name" with the member's avatar. */
export function RecordedBy({ row, className }: { row: Attribution; className?: string }) {
  const t = useT()
  const { enabled, nameOf, isMe } = useAttribution()
  const name = nameOf(row)
  if (!enabled || !name) return null
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <MemberAvatar id={row.created_by} name={name} className="size-4 text-[9px]" />
      <span className="truncate">
        {t("family.recordedBy", { name })}
        {isMe(row) && ` (${t("family.you")})`}
      </span>
    </span>
  )
}
