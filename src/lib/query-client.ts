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

export function shouldAnnounceQueryError(hadData: boolean, queryKey: readonly unknown[] = ["wallets"]): boolean {
  return !hadData && CORE.has(String(queryKey[0]))
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
          if (!shouldAnnounceQueryError(query.state.data !== undefined, query.queryKey)) return
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
