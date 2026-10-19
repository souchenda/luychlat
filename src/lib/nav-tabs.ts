/**
 * The bottom bar's right-hand tabs (founder, 19/10/2026 — the Islamic hub was buried in the ☰ menu): with Islamic
 * Mode on, the 5th tab is «ឥស្លាម» → /islamic instead of the AI advisor (still in the ☰ menu); off, unchanged.
 * Pure (nav-tabs.test.ts).
 */
export type RightTab = { id: "reports" | "advisor" | "islamic"; href: string; label: "reports.title" | "nav.advisor" | "nav.islamic" }

export function rightTabs(islamic: boolean): RightTab[] {
  return [
    { id: "reports", href: "/reports", label: "reports.title" },
    islamic ? { id: "islamic", href: "/islamic", label: "nav.islamic" } : { id: "advisor", href: "/advisor", label: "nav.advisor" },
  ]
}
