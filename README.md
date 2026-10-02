# លុយឆ្លាត · LuyChlat

Mobile-first PWA for personal and small-business money and debt management in Cambodia, in Khmer (primary) and English, with USD and KHR side by side.
Architecture, schema and roadmap: [guideline.md](guideline.md).

**Status:** ✅ All 6 roadmap phases are complete.

## Features

| Phase | What you get |
| --- | --- |
| 1 · Auth & security | Email (password or code), Google, phone; an account is required (every user starts on Free)<br>4-digit PIN, biometrics, auto-lock |
| 2 · Workspaces & wallets | 👤 Personal / 🏢 Business switcher<br>ABA, ACLEDA, Wing, Canadia, TrueMoney and cash wallets<br>Transfers, total balance in USD and KHR, hide-balance toggle |
| 3 · Ledger | Income and expenses in either currency, categories, receipt photos<br>Monthly cash flow, charts, filtered transaction history |
| 4 · Debts | Payables and receivables, partial repayments, urgency badges<br>Polite Khmer/English reminders via Telegram, SMS or share |
| 5 · Alerts & AI | Daily Telegram due-date alerts and an in-app bell<br>AI advisor: offline, or Claude / OpenAI with your own key, anonymized |
| 6 · Reports & safety | Business P&L, Excel/PDF exports, loan calculator<br>Rollback to yesterday, delete by date, reconcile, JSON backup, factory reset, installable PWA |

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase (Postgres + RLS, Auth, Storage, pg_cron) · TanStack Query · Zustand · Zod · Recharts · SheetJS · Anthropic SDK

## Run locally

**Requirements:** Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000 and sign in.

- **Supabase is required:** every user has an account (there is no offline Guest Mode), so fill in the Supabase variables in `.env.local` first (see "Connect Supabase" below).
- **Sign-in methods:** `NEXT_PUBLIC_AUTH_METHODS` lists the ones enabled in Supabase (email, email_code, google, phone, apple).
- **Biometric testing:** set `NEXT_PUBLIC_BIOMETRIC_MOCK=true` in `.env.local` to test FaceID / fingerprint unlock on a computer. Never enable it in production.
- **Testing on a phone:** open the dev server from your phone on the same Wi-Fi.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build && npm start` | Production build. The service worker (offline / install) only runs here |
| `npm run dev:lan` | Dev server reachable from phones on the same Wi-Fi (`http://<PC-IP>:3000`; add the IP to `allowedDevOrigins` in `next.config.ts`) |
| `npm run build:standalone` · `npm run start:standalone` | Self-contained server for Docker / PM2 deployments |
| `docker compose up -d --build` | Build and run the production container on port 3000 |
| `npm run lint` · `npx tsc --noEmit` | Lint and typecheck |
| `node scripts/generate-icons.mjs` | Regenerate the PWA / iOS icons in `public/icons/` |

## Connect Supabase

1. **Create a project** at [supabase.com](https://supabase.com). The Singapore region (`ap-southeast-1`) is the closest to Cambodia.
2. **Add the keys:** in Project Settings → API, copy the project URL and anon (public) key into `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
   Only the anon key belongs in the app. Never put the `service_role` key in a `NEXT_PUBLIC_*` variable.
3. **Apply the database migrations.** There are 7 files in `supabase/migrations/`, and they run in order:
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
   - **What they create:** every table with Row-Level Security, the balance and debt triggers, the `receipts` storage bucket, and the daily alert job.
   - **If `pg_cron` or `pg_net` fails:** enable them under Database → Extensions, then run `db push` again.
   - **Without the CLI:** paste each file into the SQL editor, oldest first.
4. **Configure Auth → Providers:**
   - **Phone:** enable it and connect an SMS provider (Twilio, MessageBird, Vonage…).
   - **Google** and **Apple:** enable them with your OAuth client credentials. In Google Cloud / Apple Developer, the authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
5. **Configure Auth → URL Configuration:**
   - Set **Site URL** to your app's address.
   - Add the **redirect URLs** `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback`.
6. **Check it worked:**
   - **Restart** `npm run dev` so it picks up the new keys.
   - **Sign in:** a new account should get Personal and Business workspaces with default categories.
   - **Alert job:** Database → Cron should list `luysmart-debt-alerts` (`0 1 * * *` = 08:00 in Phnom Penh).

## Deploy to Vercel

1. **Push the repository to GitHub** (or GitLab / Bitbucket):
   ```bash
   git remote add origin https://github.com/<you>/luysmart.git
   git push -u origin master
   ```
2. **Import the project:** in [vercel.com/new](https://vercel.com/new), import the repo. Vercel detects Next.js, so keep the default build settings.
3. **Add environment variables** (Project → Settings → Environment Variables), for Production and Preview:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key |
   | `NEXT_PUBLIC_BIOMETRIC_MOCK` | `false` |

   The Supabase variables are required: without them nobody can sign in.
4. **Deploy.** Then, in Supabase Auth → URL Configuration:
   - Set the **Site URL** to the Vercel domain, e.g. `https://luysmart.vercel.app`.
   - Add `https://luysmart.vercel.app/auth/callback` to the **redirect URLs**.
   - Add the same for any custom domain.
5. **Install on a phone:** open the HTTPS site on the phone. Use Android Chrome → *Install app*, or iOS Safari → Share → *Add to Home Screen*.

You can also deploy from the terminal: `npx vercel` for a preview, `npx vercel --prod` for production.

**DigitalOcean instead?** See [docs/deploy-digitalocean.md](docs/deploy-digitalocean.md). It covers App Platform (from GitHub) and a Droplet (Docker or PM2, plus Nginx and Certbot SSL), using the included `Dockerfile`, `docker-compose.yml` and `.do/app.yaml`.

Server routes and services on Vercel:

| Route / service | Notes |
| --- | --- |
| `/api/advisor` | Live AI with the user's own key; runs up to 60 s (`maxDuration`). Keep within your Vercel plan's function limit |
| `/api/telegram` | Edge proxy for test messages and the "Find chat ID" button |
| Daily alerts | Run inside Supabase (`pg_cron` + `pg_net`), not on Vercel; no Vercel cron needed |

### Before going live

- **Biometric mock:** set `NEXT_PUBLIC_BIOMETRIC_MOCK=false` (it is off by default).
- **Test the cloud path end to end:** phone OTP, Google/Apple login, a repayment, a receipt upload, and the Telegram test message.
- **Database backups:** turn on Supabase backups or point-in-time recovery. Users can also download a copy of their data (Settings → ការគ្រប់គ្រងទិន្នន័យ).
- **Known `npm audit` warning:** 2 findings in the `postcss` copy bundled inside Next.js 15. They clear with a future Next.js major upgrade.

## Project layout

```
src/
  app/
    login/              Google, email (password / code), phone
    auth/callback/      OAuth code exchange
    (app)/              Auth-gated shell: workspace switcher, App Lock overlay, bottom nav
      home/  transactions/  debts/ (+ [id], calculator/)  advisor/  reports/  wallets/  categories/  settings/
    api/telegram/       Proxy to the Telegram Bot API (test message, find chat ID); token per request, never stored
    api/advisor/        Live AI advisor: Claude (official SDK, claude-opus-5-5) or OpenAI with the user's own key
    manifest.ts         PWA manifest
  components/
    auth/  lock/  layout/  wallets/  workspace/  transactions/  categories/  debts/  dashboard/  advisor/  notifications/  reports/  settings/  money/  common/  ui/ (shadcn)
  lib/
    data/               DataRepo interface (supabase-repo) plus React Query hooks
    data/ledger.ts      Wallet balance effects (mirrors the DB trigger)
    analytics.ts        Monthly cash flow, 6-month trend, top spending
    debts.ts            Remaining, status, urgency bands (>7d / 1-7d / due), interest estimate
    reminder.ts         Khmer / English payment-reminder text, Telegram & SMS share links
    alerts.ts           Due-date alert stages (D7 / D3 / D0 / OVERDUE) and Telegram message text
    reports/            pl.ts (cash-basis P&L), ranges.ts (period presets), export.ts (.xlsx via SheetJS, loaded on demand)
    loans/amortization.ts  Flat-rate vs reducing-balance schedules
    data/backup.ts      .json backup export / validated restore
    auth/reset.ts       Danger Zone: wipe cloud data (reset_my_data) and everything on the device
    advisor/            snapshot (metrics, DTI, 30-day liquidity, health score), strategy (Snowball vs Avalanche),
                        engine (offline answers), payload (strict anonymous schema sent to AI)
    categories/         Preset categories (Personal / Business) and icon set
    money.ts            USD/KHR rounding, conversion, formatting
    wallets/providers.ts  ABA, ACLEDA, Wing, Canadia, TrueMoney, Cash presets
    supabase/           browser / server / middleware clients
    security/           pin.ts (PBKDF2), biometric.ts (WebAuthn / mock)
    i18n/               km (primary) + en dictionaries, useT()
    phone.ts            Cambodian number normalisation & formatting
  stores/               Zustand: session, lock, locale, prefs (active workspace, hide balances, rate), guest-data (old Guest Mode data, for the one-time move), ai (provider + keys, device-only)
supabase/migrations/    Schema + RLS (guideline §3)
public/sw.js            Service worker (static assets + offline shell; never caches API data)
public/icons/           PWA / iOS icons (regenerate: node scripts/generate-icons.mjs)
```

## Accounts only (Guest Mode retired)

Every user signs in, and all data lives in Supabase from day one, so nothing is lost when a phone is changed or the browser is cleared. New accounts start on the Free plan with their Personal and Business workspaces ready (database trigger).

Devices that still hold data from the old Guest Mode (`luysmart-guest-data` in localStorage, receipts in IndexedDB) are offered a one-time move into the signed-in account (`src/lib/data/guest-import.ts`). New users never see it.

## Debt alerts and Telegram

- **Cloud:** `pg_cron` runs `public.run_debt_alerts()` daily at 01:00 UTC (08:00 Phnom Penh).
  - It creates one in-app notification per debt and stage: D7 = 4-7 days left, D3 = 1-3 days, D0 = due today, OVERDUE.
  - It posts the same alert to the owner's Telegram bot through `pg_net`.
  - Requires the `pg_cron` and `pg_net` extensions, both enabled by the migration.
- **Setup:** Settings → ការរំលឹកតាម Telegram. Create a bot with @BotFather, paste the token, then tap Find to fill in the Chat ID, and send a test message.

## AI advisor

- **Offline (default):** rule-based analysis of the real numbers. It covers health score, DTI, savings rate, 30-day shortfall, unusual spending, and a Snowball vs Avalanche simulation. Nothing leaves the device.
- **Live:** choose Claude (`claude-opus-5-5` via the official Anthropic SDK) or OpenAI in Settings, with your own API key.
  - Keys stay in this browser and are sent only with each `/api/advisor` request; they are never stored server-side.
  - Claude requests opt into server-side refusal fallbacks (`fallbacks: "default"`).
- **Privacy:** only the anonymous snapshot is sent: totals, generic category keys, and debts as P1/R1 references. Names, phone numbers, wallet names and notes are never included.
  - `lib/advisor/payload.ts` defines it as a strict Zod schema, and the server re-validates it.
  - The chat has a "see exactly what's sent" view.

## Reports and export

**Reports page:** open it from the Transactions page, the dashboard, or Settings.

**Profit & Loss (cash basis):**
- **Revenue:** income categories.
- **COGS:** the stock purchases (`inventory`) category.
- **Gross profit**, with its margin.
- **Operating expenses:** every other expense category.
- **Other income.**
- **Net profit or loss**, with its margin.
- **Not counted:** transfers, debt principal (borrowed, lent, repaid) and owner capital (`investment`). These are listed underneath the statement.
- **Periods:** this month, last month, this quarter, year to date, or a custom range.
- **Currencies:** every line is shown in USD and KHR.

**Loan calculator** (Debts → គណនាកម្ចី):
- **Methods:** flat rate (interest on the original amount, common with microfinance lenders) or reducing balance (amortization).
- **Output:** monthly payment, total interest, total repayment, and the full monthly schedule.
- **Excel export** of the schedule.
- **Save as active loan:** creates a payable for principal plus interest. It can deposit just the principal into a wallet.

**Exports:**
- **Transactions (.xlsx):** Date, Type, Category, Wallet, Amount, Currency, Note, Debt Link.
- **Debts (.xlsx):** a sheet of all debts and a sheet of repayment history.
- **Library:** SheetJS 0.20.x, installed from the official SheetJS CDN tarball. The npm-registry `xlsx` package is stuck at 0.18.5 with known advisories.
- **P&L:** Print / Save as PDF uses a print layout. The browser's PDF output renders Khmer correctly.

## Data protection

Settings → ការគ្រប់គ្រងទិន្នន័យ (Data management):

- **Delete by date:** removes today's entries (or a date range) in the active workspace.
  - It previews each wallet's change first.
  - Balances and debt repayments are reversed, and older history is untouched.
  - Also available from the Transactions page.
- **Reconcile balance:** open a wallet, then កែតម្រូវ. Enter the real balance and one "balance adjustment" entry records the difference.
  - Existing wallets no longer have an editable balance field.
  - Adjustments are left out of cash flow, P&L and the advisor.
- **Backup .json:** a downloadable copy of all the account's data (no receipt photos; they stay in the account).
- **Factory reset:** Danger Zone, with a typed confirmation.

## Install (PWA)

- **Manifest:** standalone display with PNG icons (192/512), a maskable icon, and shortcuts.
- **iOS:** an `apple-touch-icon` and the apple-prefixed meta tags.
- **Install prompt:** Settings → ដំឡើងកម្មវិធី uses the native prompt on Android and Chrome, and shows step-by-step instructions on iOS Safari.
- **Service worker:** registers in production builds only (`npm run build && npm start`).

## Security notes

- **RLS:** enabled on every table. Ownership flows from `workspaces.user_id = auth.uid()`. Child tables use composite FKs `(x_id, workspace_id)`, so a row can't reference another tenant's wallet, category or debt.
- **App Lock:** a 4-digit PIN, hashed with PBKDF2-SHA256 (210k iterations, random salt) and stored only on the device.
  - 5 wrong attempts trigger a lockout that starts at 30s and doubles each time.
  - The app auto-locks when idle, or when it's left in the background for the configured time (immediately / 1 / 5 / 15 min).
  - While locked, page content is `hidden` + `inert`, not just covered by the overlay.
- **Biometrics (phase 1 "mock"):** uses a WebAuthn platform credential (FaceID / fingerprint / Windows Hello) with `userVerification: "required"`. It's a local unlock gate only; no server verifies it. Setting `NEXT_PUBLIC_BIOMETRIC_MOCK=true` simulates a successful scan for testing.
- **Sign-out:** wipes the PIN, biometric settings and AI keys on the device.
- **Reset All Data (Danger Zone):**
  - Needs typed confirmation (RESET).
  - Deletes the user's cloud data (`reset_my_data()` and their receipt files).
  - Clears every local store, IndexedDB and the offline caches.
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
| `debts.note`, `interest_period`, `start_date` | Purpose, % per year or month, and the start for the interest estimate |
| `transactions.debt_id`, `debt_repayments.transaction_id` | Each repayment is also a ledger row (expense for a payable, income for a receivable), so wallets, history and cash flow stay consistent |
| `record_debt_repayment()` | Records the ledger row and the repayment atomically; rejects amounts above what is left |
| `debts_derive` and repayment triggers | `paid_amount` and `status` are always derived from repayments; a debt's currency is fixed once repaid |
| `transactions_debt_guard` | A repayment's ledger row can't change amount, wallet or currency (only note, date, category); deleting it deletes the repayment |
| `debts.disbursement_transaction_id` + `disburse_debt()` | Optional "move money" when a debt is created (borrowed funds in / lent funds out), once per debt |
| `telegram_settings` | Per-user bot token, chat ID, on/off and language (owner-only RLS) |
| `notifications.alert_key` (unique per debt) | Each alert stage fires once per debt |
| `run_debt_alerts()` + `pg_cron` job | Daily 08:00 alerts, in-app and via Telegram |
| `reset_my_data()` | Danger Zone: deletes the caller's financial data and re-seeds default categories |
| `reconcile_wallet()` | Atomic "set real balance": one adjustment ledger row for the difference |
| `disburse_debt(..., p_amount)` | Optional amount, so a calculator loan deposits only the principal |
