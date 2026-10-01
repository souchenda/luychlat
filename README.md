# លុយឆ្លាត · LuySmart

Mobile-first PWA for personal and small-business money & debt management in Cambodia.
Architecture, schema and roadmap: see [guideline.md](guideline.md).

**Status:** Roadmap phases 1-3 done: Auth (Phone, Biometric Mock, Guest Mode); Workspace Switcher + Wallets; Income/Expense ledger, categories and cash-flow dashboard.

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
    (app)/              Auth-gated shell: workspace switcher, App Lock overlay, bottom nav
      home/  transactions/  wallets/  categories/  settings/
    manifest.ts         PWA manifest
  components/
    auth/  lock/  layout/  wallets/  workspace/  transactions/  categories/  dashboard/  money/  common/  ui/ (shadcn)
  lib/
    data/               DataRepo interface: guest-repo (localStorage) and supabase-repo, plus React Query hooks
    data/ledger.ts      Wallet balance effects (mirrors the DB trigger, used by Guest Mode)
    analytics.ts        Monthly cash flow, 6-month trend, top spending
    categories/         Preset categories (Personal / Business) and icon set
    money.ts            USD/KHR rounding, conversion, formatting
    wallets/providers.ts  ABA, ACLEDA, Wing, Canadia, TrueMoney, Cash presets
    supabase/           browser / server / middleware clients
    security/           pin.ts (PBKDF2), biometric.ts (WebAuthn / mock)
    i18n/               km (primary) + en dictionaries, useT()
    phone.ts            Cambodian number normalisation & formatting
  stores/               Zustand: session, lock, locale, prefs (active workspace, hide balances, rate), guest-data
supabase/migrations/    Schema + RLS (guideline §3)
public/sw.js            Service worker (static assets + offline shell; never caches API data)
```

## Guest Mode

Guest Mode runs the full app with no Supabase project. Workspaces, wallets, categories and transactions live in localStorage (`luysmart-guest-data`); receipt photos live in IndexedDB (`luysmart-guest`). Both go through `guest-repo`. It has the same semantics as the cloud: atomic balance updates, overdraft check, and the delete and currency guards. Ending Guest Mode from Settings deletes all of it, receipts included.

## Security notes

- **RLS:** enabled on every table. Ownership flows from `workspaces.user_id = auth.uid()`. Child tables use composite FKs `(x_id, workspace_id)`, so a row can't reference another tenant's wallet, category or debt.
- **App Lock:** a 4-digit PIN, hashed with PBKDF2-SHA256 (210k iterations, random salt) and stored only on the device.
  - 5 wrong attempts trigger a lockout that starts at 30s and doubles each time.
  - The app auto-locks when idle, or when it's left in the background for the configured time (immediately / 1 / 5 / 15 min).
  - While locked, page content is `hidden` + `inert`, not just covered by the overlay.
- **Biometrics (phase 1 "mock"):** uses a WebAuthn platform credential (FaceID / fingerprint / Windows Hello) with `userVerification: "required"`. It's a local unlock gate only; no server verifies it. Setting `NEXT_PUBLIC_BIOMETRIC_MOCK=true` simulates a successful scan for testing.
- **Sign-out:** wipes the PIN and biometric settings on the device.
- **Receipts:** photos are downscaled and re-encoded on the device before upload, which also strips EXIF metadata such as GPS location.

## Schema additions beyond guideline §3

| Addition | Why |
| --- | --- |
| `categories` table | `transactions.category_id` references it |
| `transactions.to_wallet_id` | Destination wallet for `TRANSFER` (cross-wallet transfers) |
| `created_at` on all tables | Ordering / auditing |
| Signup trigger | Creates "ផ្ទាល់ខ្លួន" (PERSONAL) + "អាជីវកម្ម" (BUSINESS) workspaces for each new user |
| `wallets_accounts.sort_order`, `archived_at`, `color` | Reorder and archive wallets; `icon` holds the provider preset key |
| `transactions.to_amount` | Destination amount for cross-currency transfers; `exchange_rate` is always KHR per 1 USD |
| `transactions_balance` trigger | Keeps wallet balances in sync with transactions and blocks transfer overdrafts |
| Wallet FKs `ON DELETE NO ACTION` | A wallet with history can only be archived, not deleted |
| `wallets_accounts_currency_guard` trigger | A wallet's currency is fixed once it has transactions |
| `categories.preset_key` + `seed_default_categories()` | Presets are seeded per workspace and translated in the UI until renamed |
| Income/expense in either currency | `amount`/`currency` are as entered; the trigger moves the wallet by the converted amount at `exchange_rate` |
| `transactions_category_guard` trigger | A transaction's category must match income/expense |
| `receipts` Storage bucket | Private; one folder per user (`<uid>/...`); `receipt_url` holds the object path, shown via signed URLs |
