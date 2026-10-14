// useAssetsTotal + the net worth card when asset queries fail (React Testing Library on jsdom).
// The founder's rule — no silent guessing on money: a failed list, or gold without today's rate, is
// named in `gaps` and on the card with a retry; it is never quietly counted as $0.
import "global-jsdom/register"

import assert from "node:assert/strict"
import { after, afterEach, describe, it } from "node:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { createElement, type ReactNode } from "react"

import { NetWorthCard } from "@/components/wallets/net-worth-card"
import { useAssetsTotal } from "./assets-total"

// The app's components use the classic JSX transform under tsx (Next compiles them itself).
;(globalThis as { React?: typeof React }).React = React

const WS = "ws-1"
const SCOPE = "signed-out" // useRepo() without a session
const keys = {
  gold: ["gold", SCOPE, WS],
  diamonds: ["diamonds", SCOPE, WS],
  investments: ["investments", SCOPE, WS],
  property: ["physical-assets", SCOPE, WS],
  market: ["market-live"],
  prices: ["market-prices"],
}
const GOLD = [{ id: "g1", kind: "GOLD_BAR", grade: null, weight_hun: 10, purchase_price: null, purchase_currency: null }]

type Seed = Partial<Record<keyof typeof keys, unknown | Error>>

/** A client whose cache already holds each query's result — data, or a rejection — and never refetches by itself. */
function client(seed: Seed) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity, gcTime: Infinity, refetchOnMount: false, refetchOnWindowFocus: false } } })
  const all: Seed = { gold: [], diamonds: [], investments: [], property: [], market: null, prices: { value: {}, updated_at: null }, ...seed }
  for (const [name, value] of Object.entries(all)) {
    const queryKey = keys[name as keyof typeof keys]
    if (value instanceof Error) {
      const q = qc.getQueryCache().build(qc, { queryKey })
      q.setState({ status: "error", error: value, data: undefined, fetchStatus: "idle", errorUpdatedAt: Date.now(), errorUpdateCount: 1, fetchFailureCount: 1 })
    } else qc.setQueryData(queryKey, value)
  }
  clients.push(qc)
  return qc
}
function wrapper(qc: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children)
  }
}

const clients: QueryClient[] = []
afterEach(cleanup)
// No timers or DOM left behind: `npm test` (and the deploy build) must never hang on this file.
after(() => {
  for (const qc of clients) qc.clear()
  ;(globalThis as unknown as { window: { close: () => void } }).window.close()
})

describe("useAssetsTotal — a failed asset query is a named gap, never a silent $0", () => {
  it("gold priced by today's market rate: counted, no gap", () => {
    const qc = client({ gold: GOLD, market: { gold: { reference: { GOLD_BAR: 3000 } } } })
    const { result } = renderHook(() => useAssetsTotal(WS), { wrapper: wrapper(qc) })
    assert.ok(result.current.goldUsd > 0)
    assert.deepEqual(result.current.gaps, [])
  })

  it("market rates failed: the gold can't be valued — gap «gold», not a $0 that looks real", () => {
    const qc = client({ gold: GOLD, market: new Error("market down") })
    const { result } = renderHook(() => useAssetsTotal(WS), { wrapper: wrapper(qc) })
    assert.equal(result.current.goldUsd, 0)
    assert.equal(result.current.goldUnpriced, 1)
    assert.deepEqual(result.current.gaps, ["gold"])
  })

  it("each rejected list is named; the lists that loaded still count", () => {
    const qc = client({ gold: GOLD, market: { gold: { reference: { GOLD_BAR: 3000 } } }, diamonds: new Error("x"), property: new Error("y") })
    const { result } = renderHook(() => useAssetsTotal(WS), { wrapper: wrapper(qc) })
    assert.deepEqual(result.current.gaps, ["diamonds", "property"])
    assert.ok(result.current.goldUsd > 0)
    assert.equal(result.current.totalUsd, result.current.goldUsd)
  })

  it("retry loads only the failed lists again, and the gap clears when they load", async () => {
    const qc = client({ investments: new Error("timeout") })
    const { result } = renderHook(() => useAssetsTotal(WS), { wrapper: wrapper(qc) })
    assert.deepEqual(result.current.gaps, ["investments"])
    const goldBefore = qc.getQueryState(keys.gold)?.dataUpdatedAt
    act(() => result.current.retry())
    // No database in the test: the list loads empty — the point is it was asked again.
    await waitFor(() => assert.deepEqual(result.current.gaps, []))
    assert.equal(qc.getQueryState(keys.investments)?.status, "success")
    assert.equal(qc.getQueryState(keys.gold)?.dataUpdatedAt, goldBefore)
  })
})

describe("NetWorthCard — the gap is said under the total, with a retry", () => {
  it("«Not counted: gold, diamonds» and a tap retries", () => {
    let retried = 0
    const qc = client({})
    render(
      createElement(QueryClientProvider, { client: qc },
        createElement(NetWorthCard, { wallets: [], assetsUsd: 0, gaps: ["gold", "diamonds"], onRetryGaps: () => void retried++ }),
      ),
    )
    const badge = screen.getByRole("button", { name: /មាស, ពេជ្រ|gold, diamonds/ })
    fireEvent.click(badge)
    assert.equal(retried, 1)
  })

  it("no gap → no warning", () => {
    render(createElement(NetWorthCard, { wallets: [], assetsUsd: 0, gaps: [] }))
    assert.equal(screen.queryByText(/មិនទាន់រាប់បញ្ចូល|Not counted/), null)
  })
})
