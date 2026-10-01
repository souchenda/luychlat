import { QueryClient } from "@tanstack/react-query"

let browserClient: QueryClient | undefined

/** One QueryClient per browser tab, so non-React code (e.g. sign-out) can clear the cache. */
export function getQueryClient(): QueryClient {
  const make = () =>
    new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } })
  if (typeof window === "undefined") return make()
  browserClient ??= make()
  return browserClient
}
