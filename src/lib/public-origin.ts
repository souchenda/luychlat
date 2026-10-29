/**
 * The address people reached us at, for a redirect from a route handler. Inside the container Next sees its own
 * listen address (HOSTNAME=0.0.0.0, port 3000) in request.url, so `new URL(request.url).origin` sent the password-reset
 * link to https://0.0.0.0:3000 (found 29/10/2026). nginx passes the real Host and X-Forwarded-Proto; only our own hosts
 * are trusted (a forged Host never turns a redirect into one to another site), anything else → app.luychlat.com.
 * Pure (public-origin.test.ts).
 */

export const APP_ORIGIN = "https://app.luychlat.com"

const OWN_HOST = /^(app\.luychlat\.com|luy\.ibmserp\.com|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/i

export function publicOrigin(headers: Pick<Headers, "get">): string {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim()
  if (!OWN_HOST.test(host)) return APP_ORIGIN
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)
  const proto = (headers.get("x-forwarded-proto") ?? "").split(",")[0].trim() || (local ? "http" : "https")
  return `${proto === "http" && !local ? "https" : proto}://${host.toLowerCase()}`
}
