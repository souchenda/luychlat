"use client"

import { ArrowLeftIcon, ChevronRightIcon, GitCommitHorizontalIcon, Loader2Icon, ShieldAlertIcon } from "lucide-react"
import Link from "next/link"

import { AuditLogCard } from "@/components/admin/audit-log"
import { CustomerDirectory } from "@/components/admin/customers"
import { PaymentInstructionsForm } from "@/components/admin/business-cards"
import { PromoManager, ReferralManager } from "@/components/admin/growth"
import { BusinessMetrics, PartnerHub, PricingEngine, PrivacyNotice, StaffManager } from "@/components/admin/super-modules"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useT } from "@/lib/i18n/use-t"
import { usePlan } from "@/lib/plan"
import { FeatureFlagsCard } from "@/components/admin/feature-flags"

/**
 * Super Admin console: business metrics, prices and limits, referrals,
 * partners, staff and the audit log. Hiding the page is cosmetic — every
 * function behind it requires the super_admin role (public.require_super_admin).
 */
export default function SuperAdminPage() {
  const t = useT()
  const { plan, loading } = usePlan()

  if (loading) return <Loader2Icon className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />
  if (plan.staff_role !== "super_admin") {
    return (
      <Card className="items-center gap-2 px-6 py-10 text-center">
        <ShieldAlertIcon className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-semibold">{t("admin.forbidden")}</p>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1">
        <Button asChild size="icon" variant="ghost" aria-label={t("common.back")}>
          <Link href="/admin">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{t("super.title")}</h1>
      </div>
      <PrivacyNotice />
      {/* Development: what shipped each day (live today) and the roadmap; EOD report at 23:59. */}
      <Link href="/admin/super/changelog" className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-muted/50">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
          <GitCommitHorizontalIcon className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t("dev.title")}</span>
          <span className="block text-xs text-muted-foreground">{t("dev.cardHint")}</span>
        </span>
        <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
      </Link>
      <BusinessMetrics />
      <CustomerDirectory />
      <PricingEngine />
      <PaymentInstructionsForm />
      <ReferralManager />
      <PromoManager />
      <PartnerHub />
      <FeatureFlagsCard />
      <StaffManager />
      <AuditLogCard />
    </div>
  )
}
