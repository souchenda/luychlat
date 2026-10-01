export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

/** False until .env.local is filled in; the app then runs in Guest Mode only. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
