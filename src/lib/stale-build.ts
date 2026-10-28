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

/** sessionStorage: the build this tab already reloaded for after a missing code chunk — once per build, never a loop. */
export const CHUNK_RELOADED_KEY = "luychlat:chunk-reloaded-for"

/**
 * A page still running the previous build asks for one of its code chunks after the update removed it (founder,
 * 28/10/2026 — «never stuck after an update»): every browser words it differently.
 */
export function isChunkError(message: string | null | undefined): boolean {
  if (!message) return false
  return /ChunkLoadError|Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)
}

/** Reload once onto the live build — never twice for the same running build, never on the SoundBox (its tap-unlocked sound). */
export function shouldReloadForChunk(o: { message: string | null | undefined; running: string | null | undefined; pathname: string; reloadedFor: string | null }): boolean {
  if (!isChunkError(o.message)) return false
  if (o.pathname === "/soundbox" || o.pathname.startsWith("/soundbox/")) return false
  return o.reloadedFor !== (o.running ?? "unknown")
}
