"use client"

import type { Provider } from "@supabase/supabase-js"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/use-t"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { authMethods } from "@/lib/supabase/config"

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.32 2.99-7.34z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.75-5.59-4.1H3.08v2.58A9.99 9.99 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.11-1.31.31-1.92V7.5H3.08A9.99 9.99 0 0 0 2 12c0 1.61.39 3.14 1.08 4.5l3.33-2.58z" />
      <path fill="#EA4335" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.86-2.87C16.95 2.99 14.7 2 12 2a9.99 9.99 0 0 0-8.92 5.5l3.33 2.58C7.2 7.73 9.4 5.98 12 5.98z" />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
      <path d="M16.37 12.62c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.78.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.59.68-1.1 1.77-.96 2.81 1.01.08 2.05-.52 2.69-1.29z" />
    </svg>
  )
}

export function SocialLogin({ disabled }: { disabled?: boolean }) {
  const t = useT()

  const signIn = async (provider: Provider) => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/home` },
    })
    if (error) toast.error(t("login.oauthError"))
  }

  return (
    <div className="grid gap-2.5">
      {authMethods.has("google") && (
        <Button
          variant="outline"
          className="h-12 rounded-xl border border-neutral-200 bg-white text-base font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-white dark:text-neutral-800 dark:hover:bg-neutral-100"
          onClick={() => signIn("google")}
          disabled={disabled}
        >
          <GoogleIcon />
          {t("login.google")}
        </Button>
      )}
      {authMethods.has("apple") && (
        <Button variant="outline" className="h-12 rounded-xl text-base font-semibold shadow-sm" onClick={() => signIn("apple")} disabled={disabled}>
          <AppleIcon />
          {t("login.apple")}
        </Button>
      )}
    </div>
  )
}
