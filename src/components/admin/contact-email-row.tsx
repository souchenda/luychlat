"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MailIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { confirmChange, rpc } from "@/components/admin/ui"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { contactEmailError } from "@/lib/auth-identifier"
import { useT } from "@/lib/i18n/use-t"
import { usePlan } from "@/lib/plan"

/**
 * The founder sets a member's contact email from their card (19/10/2026) — e.g. a phone-registered member's real
 * address. Never their sign-in. Founder only, audited (admin_set_contact_email).
 */
export function ContactEmailRow({ userId, name }: { userId: string; name: string }) {
  const t = useT()
  const queryClient = useQueryClient()
  const founder = usePlan().plan.staff_role === "super_admin"
  const current = useQuery({
    queryKey: ["admin", "contact-email", userId],
    enabled: founder,
    queryFn: () => rpc<string | null>("admin_contact_email", { p_user_id: userId }),
  })
  const [value, setValue] = useState("")
  useEffect(() => setValue(current.data ?? ""), [current.data])
  const save = useMutation({
    mutationFn: (args: { p_user_id: string; p_email: string; p_note: string }) => rpc("admin_set_contact_email", args),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["admin", "contact-email", userId] })
    },
    onError: () => toast.error(t("common.error")),
  })
  if (!founder) return null
  const changed = value.trim().toLowerCase() !== (current.data ?? "")
  const submit = async () => {
    if (contactEmailError(value)) return void toast.error(t("profile.emailInvalid"))
    const note = await confirmChange(t("admin.contactEmailPrompt", { name, email: value.trim() || "—" }), t)
    if (note) save.mutate({ p_user_id: userId, p_email: value.trim(), p_note: note })
  }
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-sm font-medium [&_svg]:size-4">
        <MailIcon className="text-sky-600" />
        {t("admin.contactEmail")}
      </p>
      <div className="flex gap-2">
        <Input type="email" inputMode="email" autoCapitalize="none" placeholder="name@example.com" value={value} onChange={(e) => setValue(e.target.value)} className="h-10" />
        <Button size="sm" className="h-10" disabled={!changed || save.isPending} onClick={() => void submit()}>
          {t("admin.contactEmailSave")}
        </Button>
      </div>
    </div>
  )
}
