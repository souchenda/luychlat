import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { supabaseAnonKey, supabaseUrl } from "./config"
import { cleanFetch } from "@/lib/supabase/clean-fetch"

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: cleanFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component; middleware refreshes the session instead.
        }
      },
    },
  })
}
