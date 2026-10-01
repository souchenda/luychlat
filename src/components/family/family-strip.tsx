"use client"

import { UserPlusIcon } from "lucide-react"
import Link from "next/link"

import { useMembers } from "@/lib/data/hooks"
import type { Workspace } from "@/lib/data/types"
import { useT } from "@/lib/i18n/use-t"

import { MemberAvatar } from "./member-avatar"

/** Home header in a family workspace: who shares it, or a nudge to invite someone. */
export function FamilyStrip({ workspace }: { workspace: Workspace }) {
  const t = useT()
  const members = useMembers(workspace.id).data ?? []
  return (
    <Link href="/settings#family" className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
      <span className="flex -space-x-1.5">
        {members.slice(0, 4).map((m) => (
          <MemberAvatar key={m.id} id={m.user_id} name={m.display_name} className="size-6 ring-2 ring-background" />
        ))}
      </span>
      {members.length > 1 ? (
        <span className="truncate">
          {workspace.name} · {t("family.memberCount", { count: members.length })}
        </span>
      ) : (
        <span className="flex items-center gap-1 truncate text-primary">
          <UserPlusIcon className="size-4" aria-hidden />
          {t("family.invite")}
        </span>
      )}
    </Link>
  )
}
