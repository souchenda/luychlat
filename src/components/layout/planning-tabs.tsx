"use client"

import { useRouter } from "next/navigation"

import { Segmented } from "@/components/common/segmented"
import { useT } from "@/lib/i18n/use-t"

/** Budgets and saving goals are one menu section ("ផែនការថវិកា & សន្សំ"): a switch on top of both pages. */
export function PlanningTabs({ active }: { active: "budgets" | "goals" }) {
  const t = useT()
  const router = useRouter()
  return (
    <Segmented
      aria-label={t("nav.budgetSaving")}
      value={active}
      onChange={(v) => router.replace(v === "goals" ? "/goals" : "/budgets", { scroll: false })}
      options={[
        { value: "budgets", label: t("nav.tabBudgets") },
        { value: "goals", label: t("nav.tabGoals") },
      ]}
    />
  )
}
