import { cleanJsonBody } from "@/lib/clean-text"

/**
 * The fetch every Supabase client in the app uses (founder, 15/10/2026): each JSON request body is
 * cleaned of what PostgreSQL rejects (NUL, lone surrogates, control characters — lib/clean-text.ts)
 * before it leaves, so no feature can send raw extracted text by mistake. Sign-in calls (/auth/v1/)
 * are passed untouched — a password is never altered. Uploads (Blob / FormData bodies) too.
 */
export const cleanFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (init && typeof init.body === "string" && !url.includes("/auth/v1/")) return fetch(input, { ...init, body: cleanJsonBody(init.body) })
  return fetch(input, init)
}

/** Client options with the cleaning fetch (merged into any `global` options given). */
export function withCleanFetch<T extends object>(options: T): T & { global: { fetch: typeof fetch } } {
  const global = (options as { global?: Record<string, unknown> }).global ?? {}
  return { ...options, global: { ...global, fetch: cleanFetch } }
}
