import { QueryCache, QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

let browserClient: QueryClient | undefined

/**
 * A query that fails before it ever loaded (offline, a timeout, a permission error) is SAID — never
 * shown as «no wallets» / «not found» with nothing else (founder, 14/10/2026). One toast at a time;
 * background refreshes of data already on screen stay quiet.
 */
export const QUERY_ERROR_TOAST = "⚠️ មិនអាចផ្ទុកទិន្នន័យបានទេ — សូមពិនិត្យអ៊ីនធឺណិត ហើយទាញចុះដើម្បីផ្ទុកម្ដងទៀត។"

export function shouldAnnounceQueryError(hadData: boolean): boolean {
  return !hadData
}

/** One QueryClient per browser tab, so non-React code (e.g. sign-out) can clear the cache. */
export function getQueryClient(): QueryClient {
  const make = () =>
    new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
      queryCache: new QueryCache({
        onError: (error, query) => {
          if (!shouldAnnounceQueryError(query.state.data !== undefined)) return
          console.error("[query]", query.queryKey, error)
          if (typeof window !== "undefined") toast.error(QUERY_ERROR_TOAST, { id: "query-error" })
        },
      }),
    })
  if (typeof window === "undefined") return make()
  browserClient ??= make()
  return browserClient
}
