"use client"

import { useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNowStrict } from "date-fns"
import { toast } from "sonner"

import { stepUp } from "@/components/security/step-up"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

/** Shared pieces of the /admin and /admin/super pages. */

export const rpc = async <T,>(name: string, args?: Record<string, unknown>) => {
  const { data, error } = await getSupabaseBrowserClient()!.rpc(name, args)
  if (error) throw error
  return data as T
}

export const who = (u: { display_name: string | null; email: string | null }) => u.display_name || u.email || "—"
export const ago = (iso: string | null) => (iso ? formatDistanceToNowStrict(new Date(iso), { addSuffix: true }) : "—")

export function useInvalidateAdmin() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ["admin"] })
}

export function Section({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        <h2 className="flex-1 text-sm font-medium text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Stat({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl px-3 py-2.5", accent ? "bg-primary/10" : "bg-muted/60")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-bold tabular-nums", accent && "text-primary")}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Asks for the reason (kept in the audit log) and the admin's own 2FA; null when cancelled. */
export async function confirmChange(prompt: string, t: (k: MessageKey) => string): Promise<string | null> {
  const note = window.prompt(prompt)
  if (note === null) return null
  if (note.trim().length < 3) {
    toast.error(t("mfa.adminResetNoteRequired"))
    return null
  }
  return (await stepUp(prompt)) ? note.trim() : null
}
