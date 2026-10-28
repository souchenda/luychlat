import type { Metadata } from "next"

import { LostView } from "./lost-view"

export const metadata: Metadata = {
  title: "ទូរសព្ទបាត់ ឬខូច? · អេប លុយឆ្លាត",
  description: "Phone lost or broken? Protect your App Luy Chlat account in a few steps.",
}

/** The lost-phone page (founder, 28/10/2026): no sign-in needed to read it; the one-tap protection once signed in. */
export default function LostPage() {
  return <LostView />
}
