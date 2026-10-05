"use client"

import { ArrowLeftIcon, Loader2Icon, ShieldAlertIcon } from "lucide-react"
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
