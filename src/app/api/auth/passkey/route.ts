import { NextResponse } from "next/server"

import { allowedOrigins, relyingParty } from "@/lib/passkey-rp"
import { guardRequest, readJson } from "@/lib/server/guard"
import { logEvent } from "@/lib/server/events"
import { authenticationOptions, authenticationVerify, passkeysEnabled, registrationOptions, registrationVerify } from "@/lib/server/passkeys"

/**
 * Passkeys (Face ID / Touch ID / fingerprint): POST { step } —
 *   register-options / register-verify   (signed in: add this device)
 *   login-options / login-verify         (signed out: sign in with no password)
 * Every response is verified on this server (W3C WebAuthn, @simplewebauthn/server); only our own
 * origins may call it. GET says whether the feature is on (the service-role key is set).
 */
export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({ enabled: passkeysEnabled() })
}

const STATUS: Record<string, number> = { signed_out: 401, expired: 400, invalid: 401, unknown: 404, unavailable: 403, duplicate: 409, busy: 503 }

export async function POST(request: Request) {
  const blocked = guardRequest(request, { name: "auth-passkey", limit: 20, windowMs: 60_000, maxBytes: 20_000 })
  if (blocked) return blocked
  if (!passkeysEnabled()) return NextResponse.json({ error: "off" }, { status: 503 })
  const rp = relyingParty(request.headers.get("origin"), allowedOrigins())
  if (!rp) return NextResponse.json({ error: "origin" }, { status: 403 })
  const body = (await readJson(request, 20_000)) as Record<string, unknown> | null
  try {
    const result =
      body?.step === "register-options"
        ? await registrationOptions(rp)
        : body?.step === "register-verify"
          ? await registrationVerify(rp, body as Parameters<typeof registrationVerify>[1])
          : body?.step === "login-options"
            ? await authenticationOptions(rp)
            : body?.step === "login-verify"
              ? await authenticationVerify(rp, body as Parameters<typeof authenticationVerify>[1])
              : { error: "bad_step" as const }
    if ("error" in result && result.error) return NextResponse.json(result, { status: STATUS[result.error] ?? 400 })
    return NextResponse.json(result)
  } catch (e) {
    logEvent("error", "passkeys", `Passkey ${String(body?.step)} failed: ${e instanceof Error ? e.message : String(e)}`, { fold: true })
    return NextResponse.json({ error: "busy" }, { status: 503 })
  }
}
