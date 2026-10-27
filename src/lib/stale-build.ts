// A phone that kept the app open in the background across a deploy keeps running the OLD code (founder, 27/10/2026 —
// Task #526: the Maghrib Adhan rang on the S24 after the Task #525 fix was live — the app was never reloaded, so the old
// scheduler still planned the Adhan). Coming back on screen, the app asks the server which build is live and reloads
// once onto it. Pure (stale-build.test.ts); the hook is components/common/stale-build-reload.tsx.

/** Back on screen after at least this long in the background — never in the middle of something being typed. */
export const STALE_HIDDEN_MS = 60_000

/** sessionStorage: the build this tab already reloaded for — at most one reload per new build, never a loop. */
export const STALE_RELOADED_KEY = "luychlat:reloaded-for-build"

/**
 * Whether to reload: a known, different build is live, the page was away long enough, it is not the SoundBox (its
 * sound is unlocked by a tap — a reload would silence the sales alerts) and this tab has not already reloaded for it.
 */
export function shouldReloadForBuild(o: {
  running: string | null | undefined
  deployed: string | null | undefined
  hiddenMs: number
  pathname: string
  reloadedFor: string | null
}): boolean {
  if (!o.running || !o.deployed || o.running === o.deployed) return false
  if (o.hiddenMs < STALE_HIDDEN_MS) return false
  if (o.pathname === "/soundbox" || o.pathname.startsWith("/soundbox/")) return false
  return o.reloadedFor !== o.deployed
}
