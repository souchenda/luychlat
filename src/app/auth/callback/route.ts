import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

const EMAIL_LINK_TYPES: EmailOtpType[] = ["email", "signup", "magiclink", "recovery", "invite", "email_change"]

/**
 * Redirect target for OAuth (Google / Apple: ?code=) and for links in Supabase
 * emails (confirm sign-up, reset password: ?token_hash=&type=). Email links
 * use token_hash so they also work when opened on another device.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/home"
  // Only allow same-origin relative redirects.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/home"

  const supabase = await createSupabaseServerClient()
  if (tokenHash && type && EMAIL_LINK_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`)
    return NextResponse.redirect(`${origin}/login?error=link`)
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`)
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`)
}
