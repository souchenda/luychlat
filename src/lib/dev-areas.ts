/**
 * Super Admin › Development: commit scope → product area, shared by the
 * changelog page and the 23:59 end-of-day Telegram report (one place to adjust).
 */
export const DEV_AREAS: { key: string; scopes: string[] }[] = [
  { key: "accounts", scopes: ["auth", "login", "account", "accounts", "signup", "onboarding", "profile"] },
  { key: "wallets", scopes: ["wallets", "wallet", "home", "market", "transactions", "reports", "assets", "budgets", "debts"] },
  { key: "telegram", scopes: ["bot", "telegram", "api", "khqr"] },
  { key: "culture", scopes: ["culture", "holy-day", "bills", "calendar", "lunar"] },
  { key: "pools", scopes: ["pools", "pool"] },
  { key: "security", scopes: ["security"] },
  { key: "admin", scopes: ["admin", "watchdog", "deploy", "ops", "nav", "settings"] },
]

export const DEV_AREA_KEYS = [...DEV_AREAS.map((a) => a.key), "other"]

export const devAreaOf = (scope: string | null | undefined) => DEV_AREAS.find((a) => scope && a.scopes.includes(scope.toLowerCase()))?.key ?? "other"

/** Commits grouped by area, in DEV_AREA_KEYS order. */
export function groupByArea<T extends { scope: string | null }>(commits: T[]): { key: string; items: T[] }[] {
  const by = new Map<string, T[]>()
  for (const c of commits) {
    const key = devAreaOf(c.scope)
    by.set(key, [...(by.get(key) ?? []), c])
  }
  return DEV_AREA_KEYS.filter((k) => by.has(k)).map((k) => ({ key: k, items: by.get(k)! }))
}
