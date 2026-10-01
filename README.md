# លុយឆ្លាត · LuySmart

Mobile-first PWA for personal and small-business money & debt management in Cambodia.
Architecture, schema and roadmap: see [guideline.md](guideline.md).

**Status:** All 6 roadmap phases are done (see guideline.md).

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
      home/  transactions/  debts/ (+ [id], calculator/)  advisor/  reports/  wallets/  categories/  settings/
    api/telegram/       Proxy to the Telegram Bot API (test message, find chat ID); token per request, never stored
    api/advisor/        Live AI advisor: Claude (official SDK, claude-opus-5-5) or OpenAI with the user's own key
    manifest.ts         PWA manifest
  components/
    auth/  lock/  layout/  wallets/  workspace/  transactions/  categories/  debts/  dashboard/  advisor/  notifications/  reports/  settings/  money/  common/  ui/ (shadcn)
  lib/
    data/               DataRepo interface: guest-repo (localStorage) and supabase-repo, plus React Query hooks
    data/ledger.ts      Wallet balance effects (mirrors the DB trigger, used by Guest Mode)
    analytics.ts        Monthly cash flow, 6-month trend, top spending
    debts.ts            Remaining, status, urgency bands (>7d / 1-7d / due), interest estimate
    reminder.ts         Khmer / English payment-reminder text, Telegram & SMS share links
    alerts.ts           Due-date alert stages (D7 / D3 / D0 / OVERDUE) and Telegram message text
    reports/            pl.ts (cash-basis P&L), ranges.ts (period presets), export.ts (.xlsx via SheetJS, loaded on demand)
    loans/amortization.ts  Flat-rate vs reducing-balance schedules
    data/snapshots.ts   Daily snapshots + rollback (Guest Mode, IndexedDB)
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
  stores/               Zustand: session, lock, locale, prefs (active workspace, hide balances, rate), guest-data, ai (provider + keys, device-only)
supabase/migrations/    Schema + RLS (guideline §3)
public/sw.js            Service worker (static assets + offline shell; never caches API data)
public/icons/           PWA / iOS icons (regenerate: node scripts/generate-icons.mjs)
```

## Guest Mode

Guest Mode runs the full app with no Supabase project. Workspaces, wallets, categories, transactions, debts and repayments live in localStorage (`luysmart-guest-data`); receipt photos live in IndexedDB (`luysmart-guest`). Both go through `guest-repo`. It has the same semantics as the cloud: atomic balance updates, overdraft check, and the delete and currency guards. Ending Guest Mode from Settings deletes all of it, receipts included.

## Debt alerts and Telegram

- **Cloud:** `pg_cron` runs `public.run_debt_alerts()` daily at 01:00 UTC (08:00 Phnom Penh).
  - It creates one in-app notification per debt and stage: D7 = 4-7 days left, D3 = 1-3 days, D0 = due today, OVERDUE.
  - It posts the same alert to the owner's Telegram bot through `pg_net`.
  - Requires the `pg_cron` and `pg_net` extensions, both enabled by the migration.
- **Guest Mode:** the app runs the same check when it opens, at most once a day. It sends through `/api/telegram`.
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

- **Rollback to yesterday (Guest Mode):**
  - A snapshot is saved to IndexedDB the first time the app opens each day, before any change. That is the end-of-yesterday state.
  - The last 7 days are kept.
  - Restoring first saves an undo point, so a rollback can itself be undone.
- **Delete by date:** removes today's entries (or a date range) in the active workspace.
  - It previews each wallet's change first.
  - Balances and debt repayments are reversed, and older history is untouched.
  - Also available from the Transactions page.
- **Reconcile balance:** open a wallet, then កែតម្រូវ. Enter the real balance and one "balance adjustment" entry records the difference.
  - Existing wallets no longer have an editable balance field.
  - Adjustments are left out of cash flow, P&L and the advisor.
- **Backup .json:**
  - Export works in both modes. Guest Mode includes receipt photos; cloud exports include all data but no photos.
  - Restore (Guest Mode) validates the file field by field and checks references between records before replacing anything, and saves an undo point first.
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
