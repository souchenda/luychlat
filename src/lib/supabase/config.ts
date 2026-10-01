export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

/** False until .env.local is filled in; the app then runs in Guest Mode only. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/** email = email + password, email_code = one-time code by email (needs custom SMTP). */
export type AuthMethod = "email" | "email_code" | "phone" | "google" | "apple"

/**
 * Sign-in options shown on the login screen. List only what is switched on in
 * Supabase (Authentication › Sign In / Providers): an option that isn't ends
 * on a Supabase error page. Comma separated; defaults to email only.
 */
export const authMethods = new Set(
  (process.env.NEXT_PUBLIC_AUTH_METHODS || "email")
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter((m): m is AuthMethod => ["email", "email_code", "phone", "google", "apple"].includes(m)),
)
