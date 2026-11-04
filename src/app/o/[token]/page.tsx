import type { Metadata } from "next"

import { OrderStatus } from "@/components/order/order-status"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "ការកម្មង់របស់ខ្ញុំ · អេប លុយឆ្លាត", robots: { index: false, follow: false } }

/** The customer's own order: pay by KHQR, then follow it to «ready» (founder, 4/11/2026). The token is the only key. */
export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <OrderStatus token={token} />
}
