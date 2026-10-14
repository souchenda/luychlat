// Imported FIRST by tests that render data hooks: no Supabase, so a query function never reaches the
// network — the deploy build has NEXT_PUBLIC_SUPABASE_URL set, and a real request there made a test
// fail and hang the build (14/10/2026).
process.env.NEXT_PUBLIC_SUPABASE_URL = ""
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ""
