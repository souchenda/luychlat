import { QueryCache, QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

let browserClient: QueryClient | undefined

/**
 * A query that fails before it ever loaded (offline, a timeout, a permission error) is SAID — never
 * shown as «no wallets» / «not found» with nothing else (founder, 14/10/2026). One toast at a time;
 * background refreshes of data already on screen stay quiet.
 */
export const QUERY_ERROR_TOAST = "⚠️ មិនអាចផ្ទុកទិន្នន័យបានទេ — សូមពិនិត្យអ៊ីនធឺណិត ហើយទាញចុះដើម្បីផ្ទុកម្ដងទៀត។"

/**
 * The data whose empty screen would be read as «you have none» — only these raise the global warning
 * (founder, 14/10/2026: a side widget — a photo, market prices, a tip — failing put the red banner over a
 * dashboard whose wallets and balances were all there). A side widget's failure stays in its own place
 * (and in the console).
 */
const CORE = new Set(["workspaces", "profile", "wallets", "categories", "transactions", "debts", "budgets", "bills", "tontines"])

/** Pages a signed-out visitor sees (founder, 15/10/2026: the warning showed on /login before signing in). */
const PUBLIC_PATHS = ["/login", "/join", "/reset-password", "/auth", "/p/", "/legal", "/download", "/lost"]
export const isPublicPath = (pathname: string | null | undefined) =>
  !!pathname && (pathname === "/" || PUBLIC_PATHS.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p.endsWith("/") ? p : `${p}/`)))

/** Not signed in (yet), or the sign-in expired: the sign-in flow handles it — never «can't load data». */
export function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const e = error as { message?: unknown; code?: unknown; status?: unknown }
  const message = typeof e.message === "string" ? e.message : ""
  return (
    message === "not_signed_in" ||
    e.status === 401 ||
    e.code === "PGRST301" ||
    e.code === "PGRST302" ||
    /jwt|not authenticated|unauthori[sz]ed|refresh token/i.test(message)
  )
}

export function shouldAnnounceQueryError(
  hadData: boolean,
  queryKey: readonly unknown[] = ["wallets"],
  error: unknown = null,
  pathname: string | null = null,
): boolean {
  if (hadData || !CORE.has(String(queryKey[0]))) return false
  // Before sign-in: the queries run with the «signed-out» scope and fail by design.
  if (queryKey[1] === "signed-out" || isAuthError(error) || isPublicPath(pathname)) return false
  return true
}

/** Core data loaded (again): any warning about it is out of date — taken away. */
export const isCoreQuery = (queryKey: readonly unknown[]) => CORE.has(String(queryKey[0]))

/** One QueryClient per browser tab, so non-React code (e.g. sign-out) can clear the cache. */
export function getQueryClient(): QueryClient {
  const make = () =>
    new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
      queryCache: new QueryCache({
        onError: (error, query) => {
          console.error("[query]", query.queryKey, error)
          const pathname = typeof window === "undefined" ? null : window.location.pathname
          if (!shouldAnnounceQueryError(query.state.data !== undefined, query.queryKey, error, pathname)) return
          if (typeof window !== "undefined") toast.error(QUERY_ERROR_TOAST, { id: "query-error" })
        },
        onSuccess: (_data, query) => {
          if (typeof window !== "undefined" && isCoreQuery(query.queryKey)) toast.dismiss("query-error")
        },
      }),
    })
  if (typeof window === "undefined") return make()
  browserClient ??= make()
  return browserClient
}
