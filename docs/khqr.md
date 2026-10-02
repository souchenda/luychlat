# Step B: KHQR checkout with instant PRO

## How it works

1. **Get PRO › Pay with KHQR.** The server builds a dynamic KHQR containing the exact plan price ($2.99 / $24.99 or the riel price), a unique bill number and a 15-minute expiry. It stores the KHQR with its MD5 (`khqr_create_payment`).
   - The QR string is identical to what the National Bank's official SDK (`bakong-khqr`) produces; a test compares the two byte for byte.
2. **The user scans it** with ABA, ACLEDA, Wing or any KHQR bank app. They can also save the QR image and scan it from their gallery, or tap "Open bank app" (Bakong's deeplink, when available).
3. **The checkout asks the server every 4 seconds** (`GET /api/billing/khqr/:id`).
   - The server asks Bakong with `check_transaction_by_md5`, at most once every 3 seconds per payment.
   - When Bakong returns a transaction to our account for the exact amount and currency, `khqr_confirm_payment` marks it PAID, extends PRO and records the subscription event, all in one database transaction.
   - The user sees the 🎉 screen at once.
4. **Expiry:** at zero the QR shows as expired, with "New QR" and "I already paid".
   - A payment Bakong reports later (up to 24 hours) still activates PRO.
   - Manual approval in `/admin` remains the fallback.

**Security:**
- Only the server, using the service-role secret key, can create or confirm KHQR payments.
- The amount always comes from `public.plans`.
- One Bakong transaction can activate only one payment.
- Confirming twice does nothing the second time.

## Settings (server `.env`, next to `docker-compose.yml`)

| Variable | |
|---|---|
| `KHQR_MODE` | `off` (default), `sandbox` or `production` |
| `SUPABASE_SECRET_KEY` | Supabase › Project Settings › API Keys › **Secret key** (`sb_secret_…`). Server-only, never `NEXT_PUBLIC_` |
| `BAKONG_ACCOUNT_ID` | Your Bakong account ID that receives the money, e.g. `name@aclb` |
| `BAKONG_MERCHANT_NAME` / `BAKONG_MERCHANT_CITY` | Shown in the bank app (max 25 / 15 characters) |
| `BAKONG_MERCHANT_ID` + `BAKONG_ACQUIRING_BANK` | Only for a merchant (business) KHQR. Leave both empty for an individual account |
| `BAKONG_API_TOKEN` | Bakong Open API token. **It expires; renew it before then** |
| `BAKONG_API_URL` | Default `https://api-bakong.nbc.gov.kh` |
| `KHQR_EXPIRY_MINUTES` | 10–15 (default 15) |

After editing `.env`, run `docker compose up -d`.

## Sandbox first

1. Run the updated `supabase_full_setup.sql` in Supabase.
2. Set `KHQR_MODE=sandbox` and `SUPABASE_SECRET_KEY=…`, then run `docker compose up -d`.
3. In the app, sign in with your admin account: **Get PRO › Pay with KHQR**. Check the QR, timer and "Save QR image", then tap **Simulate payment (admin)**. PRO turns on instantly with the 🎉 screen.
   - Sandbox payments are marked and **not counted as revenue**.
   - Only admins can simulate, and only in sandbox mode.
   - The sandbox QR uses a test account, so don't pay it with real money.

## Going live

1. Get the merchant Bakong account ID and an API token (Bakong Open API registration).
2. Set `KHQR_MODE=production`, `BAKONG_ACCOUNT_ID`, `BAKONG_API_TOKEN` and the merchant name, then run `docker compose up -d`.
3. **/admin › KHQR · Bakong › Test Bakong connection** should say "reachable, token accepted".
   - **403:** the token is wrong, or Bakong refuses your server's IP or region. Bakong has been reported to accept API calls only from Cambodian IPs. If your server is abroad, run a small relay in Cambodia and set `BAKONG_API_URL` to it.
   - **401:** the token has expired; renew it.
4. Pay the $2.99 monthly plan once with your own bank app and confirm PRO turns on.

## What to double-check with your Bakong documentation

- **Transaction check:** the field names in the `check_transaction_by_md5` response (`hash`, `toAccountId`, `currency`, `amount`) follow the public examples. If your API docs differ, adjust `parseBakongCheck` in `src/lib/server/bakong.ts`; it has tests.
- **Deeplink:** "Open bank app" uses Bakong's `generate_deeplink_by_qr`.
- **Bank-specific links:** buttons like "Open in ABA" or "Open in ACLEDA" aren't publicly documented, so the app doesn't guess them. Users scan the QR, or save it and scan it from their gallery.
