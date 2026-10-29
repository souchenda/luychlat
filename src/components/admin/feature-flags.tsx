"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FileTextIcon, FlaskConicalIcon, GiftIcon, ReceiptTextIcon, ScanTextIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { ago, confirmChange, rpc, Section } from "@/components/admin/ui"
import { Segmented } from "@/components/common/segmented"
import { Card } from "@/components/ui/card"
import { type FeatureKey, type FeatureStatus } from "@/lib/features"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { useT } from "@/lib/i18n/use-t"

type Flag = { key: string; status: FeatureStatus; updated_at: string; updated_by_name: string | null }

const STATUSES: FeatureStatus[] = ["ADMIN_ONLY", "PUBLIC", "DISABLED"]

/** Super admin: open a feature to everyone once testing is done (or switch it off). Audited, with 2FA. */
export function FeatureFlagsCard() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ["admin", "feature-flags"], queryFn: () => rpc<Flag[]>("admin_feature_flags") })
  const set = useMutation({
    mutationFn: (v: { key: string; status: FeatureStatus; note: string }) => rpc("admin_set_feature_flag", { p_key: v.key, p_status: v.status, p_note: v.note }),
    onSuccess: () => {
      toast.success(t("admin.saved"))
      void queryClient.invalidateQueries({ queryKey: ["admin", "feature-flags"] })
      void queryClient.invalidateQueries({ queryKey: ["features"] })
    },
    onError: () => toast.error(t("common.error")),
  })

  const change = async (flag: Flag, status: FeatureStatus) => {
    if (status === flag.status) return
    const name = t(`feature.name.${flag.key}` as MessageKey)
    const note = await confirmChange(t("feature.prompt", { name, status: t(`feature.status.${status}` as MessageKey) }), t)
    if (note) set.mutate({ key: flag.key, status, note })
  }

  return (
    <Section title={t("feature.title")} icon={<FlaskConicalIcon />}>
      <Card className="gap-0 divide-y py-0">
        {(data ?? []).map((flag) => (
          <div key={flag.key} className="space-y-2 px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <FeatureIcon k={flag.key as FeatureKey} />
                {t(`feature.name.${flag.key}` as MessageKey)}
              </p>
              <p className="shrink-0 text-[11px] text-muted-foreground">
                {ago(flag.updated_at)}
                {flag.updated_by_name && ` · ${flag.updated_by_name}`}
              </p>
            </div>
            <Segmented
              aria-label={t(`feature.name.${flag.key}` as MessageKey)}
              value={flag.status}
              onChange={(s) => void change(flag, s)}
              disabled={set.isPending}
              options={STATUSES.map((s) => ({ value: s, label: t(`feature.status.${s}` as MessageKey) }))}
            />
          </div>
        ))}
      </Card>
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">{t("feature.hint")}</p>
    </Section>
  )
}

/** Each feature's line icon (founder, 29/10/2026 — no cartoon emoji on the app's screens). */
const FEATURE_ICONS: Record<FeatureKey, LucideIcon> = {
  invoices: ReceiptTextIcon,
  gifts: GiftIcon,
  pools: UsersIcon,
  statement_import: FileTextIcon,
  bank_slips: ScanTextIcon,
}

function FeatureIcon({ k }: { k: FeatureKey }) {
  const Icon = FEATURE_ICONS[k]
  return Icon ? <Icon className="size-4 shrink-0 text-primary" aria-hidden /> : null
}
