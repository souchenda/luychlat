"use client"

import { ArApView } from "@/components/business/ar-ap-view"

/** «ជំពាក់គេ» — what the business owes its suppliers (founder, 22/10/2026 — Task #453). */
export default function BusinessPayablesPage() {
  return <ArApView kind="PAYABLE" />
}
