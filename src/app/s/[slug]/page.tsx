import type { Metadata } from "next"

import { ShopMenu } from "@/components/order/shop-menu"

// The shop's live menu on every visit; never cached, never indexed.
export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "កម្មង់ទុកមុន · អេប លុយឆ្លាត", robots: { index: false, follow: false } }

/** «កម្មង់ទុកមុន» — a shop's public menu (founder, 4/11/2026 — docs/order-ahead.md). No sign-in. */
export default async function ShopMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ShopMenu slug={slug} />
}
