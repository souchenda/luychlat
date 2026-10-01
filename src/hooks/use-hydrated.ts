import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/** False during SSR and hydration; true afterwards. Guards UI that reads persisted (localStorage) stores. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
