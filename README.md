# លុយឆ្លាត · LuySmart

Mobile-first PWA for personal and small-business money & debt management in Cambodia.
Architecture, schema and roadmap: see [guideline.md](guideline.md).

**Status:** Roadmap phase 1 done (setup + Auth: Phone, Biometric Mock, Guest Mode).

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase · TanStack Query · Zustand · Zod · Recharts

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + anon key
npm run dev
```

Without Supabase keys, the app runs in Guest Mode only, and phone/Google/Apple login is disabled.

### Supabase setup

1. Apply the schema: `supabase db push` (or paste `supabase/migrations/*.sql` into the SQL editor).
2. **Auth → Providers**
   - **Phone:** enable it and configure an SMS provider (Twilio, MessageBird, Vonage…).
   - **Google** and **Apple:** enable them with their OAuth credentials.
3. **Auth → URL Configuration:** add `http://localhost:3000/auth/callback` (and your production URL) to the redirect URLs.

## Project layout

```
src/
  app/
    login/              Phone (+855) OTP, Google, Apple, Telegram (phase 5), Guest Mode
    auth/callback/      OAuth code exchange
    (app)/              Auth-gated shell: App Lock overlay + bottom nav
      home/  settings/
    manifest.ts         PWA manifest
  components/
    auth/  lock/  layout/  ui/ (shadcn)
  lib/
    supabase/           browser / server / middleware clients
    security/           pin.ts (PBKDF2), biometric.ts (WebAuthn / mock)
    i18n/               km (primary) + en dictionaries, useT()
    phone.ts            Cambodian number normalisation & formatting
  stores/               Zustand: session (guest/user), lock, locale
supabase/migrations/    Schema + RLS (guideline §3)
public/sw.js            Service worker (static assets + offline shell; never caches API data)
```

## Security notes

- **RLS:** enabled on every table. Ownership flows from `workspaces.user_id = auth.uid()`. Child tables use composite FKs `(x_id, workspace_id)`, so a row can't reference another tenant's wallet, category or debt.
- **App Lock:** a 4-digit PIN, hashed with PBKDF2-SHA256 (210k iterations, random salt) and stored only on the device.
  - 5 wrong attempts trigger a lockout that starts at 30s and doubles each time.
  - The app auto-locks when idle, or when it's left in the background for the configured time (immediately / 1 / 5 / 15 min).
  - While locked, page content is `hidden` + `inert`, not just covered by the overlay.
- **Biometrics (phase 1 "mock"):** uses a WebAuthn platform credential (FaceID / fingerprint / Windows Hello) with `userVerification: "required"`. It's a local unlock gate only; no server verifies it. Setting `NEXT_PUBLIC_BIOMETRIC_MOCK=true` simulates a successful scan for testing.
- **Sign-out:** wipes the PIN and biometric settings on the device.

## Schema additions beyond guideline §3

| Addition | Why |
| --- | --- |
| `categories` table | `transactions.category_id` references it |
| `transactions.to_wallet_id` | Destination wallet for `TRANSFER` (cross-wallet transfers) |
| `created_at` on all tables | Ordering / auditing |
| Signup trigger | Creates "ផ្ទាល់ខ្លួន" (PERSONAL) + "អាជីវកម្ម" (BUSINESS) workspaces for each new user |
