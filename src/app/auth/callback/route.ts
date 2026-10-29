import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { claimSingleSession } from "@/lib/auth/single-session"
import { publicOrigin } from "@/lib/public-origin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const EMAIL_LINK_TYPES: EmailOtpType[] = ["email", "signup", "magiclink", "recovery", "invite", "email_change"]

/**
 * Redirect target for OAuth (Google / Apple: ?code=) and for links in Supabase
 * emails (confirm sign-up, reset password: ?token_hash=&type=). Email links
 * use token_hash so they also work when opened on another device.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // Not request.url's origin: inside the container that is https://0.0.0.0:3000 (lib/public-origin.ts).
  const origin = publicOrigin(request.headers)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/home"
  // Only same-origin paths: "//evil.com" and "/\evil.com" would leave the site.
  const safeNext = /^\/(?![/\\])/.test(next) ? next : "/home"

  const supabase = await createSupabaseServerClient()
  if (tokenHash && type && EMAIL_LINK_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) {
      // A password-reset link is a fresh sign-in too: one device at a time.
      await claimSingleSession(supabase)
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
    return NextResponse.redirect(`${origin}/login?error=link`)
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await claimSingleSession(supabase)
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
  }

  // A reset link that failed (opened in another browser, used or expired) says so — not «Google / Apple failed».
  return NextResponse.redirect(`${origin}/login?error=${safeNext === "/reset-password" ? "link" : "oauth"}`)
}
