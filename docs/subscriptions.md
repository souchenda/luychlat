# Subscriptions, Admin & Referrals (Step A)

## Plans

| | Free | PRO Monthly | PRO Yearly |
|---|---|---|---|
| Price | — | $2.99 / ៛12,000 | $24.99 / ៛100,000 |
| Wallets | 2 | unlimited | unlimited |
| Family members (besides owner) | 1 | unlimited | unlimited |
| AI advisor | offline tips, or your own API key | LuyChlat AI, 100 questions/month | same |
| Excel / PDF export | — | ✓ | ✓ |
| Credit score | — | ✓ | ✓ |

Prices and limits live in `public.plans`. Edit them there; the app reads them.

## Where things are enforced

Everything that matters is checked **in the database**. The app only shows the upgrade sheet early.

- **Wallets:** the `guard_wallet_limit` trigger counts wallets per workspace owner. A PRO owner's family workspace is PRO too.
- **Family members:** `create_workspace_invite` and `lookup_workspace_invite` check the limit. The join page says "family is full".
- **LuyChlat AI:** `/api/advisor` with provider `luysmart`:
  - verifies the user with `auth.getUser()`;
  - checks `use_ai_query(false)`;
  - calls Claude with the server-only `ANTHROPIC_API_KEY`;
  - counts the question only after success (`use_ai_query(true)`).
- **Export / credit score:** client-side gating. The data is the user's own, so there is nothing to protect server-side.
- **Expiry:** a plan is PRO while `subscriptions.status = 'ACTIVE'` and `current_period_end > now()`. No cron is needed. When PRO ends, existing wallets and members stay; only new ones are blocked.

## Payments (static KHQR + manual approval, see docs/khqr.md)

1. The user opens **Settings › My plan › Get PRO**, transfers money using the details you set in `/admin`, and taps **"I've paid — send for review"**. This creates a `payments` row with status `PENDING` (at most 3 pending per user).
2. You open **`/admin` › Payments to review** and tap **Approve** or **Reject**.
   - Approve sets the payment to `PAID` and extends PRO from the later of now and the current end date.
3. The user's app updates instantly via Realtime and shows a toast.

## Admin

### Make yourself admin

Run this once in the Supabase SQL editor, with your own login email:

```sql
insert into public.app_admins (user_id)
select id from auth.users where email = 'YOUR_EMAIL'
on conflict do nothing;
```

After that, **Settings** shows an **Admin** button, which opens `/admin`. Every `admin_*` function re-checks `is_admin()` in the database.

### What `/admin` has

- **Active Users & Analytics:**
  - total users and new users in the last 7 days;
  - DAU (24h) and MAU (30d), based on last sign-in, last app open, or last transaction;
  - PRO vs Free;
  - pending payments, plans expiring within 7 days, and 30-day revenue.
- **Payments to review:** approve or reject.
- **Users & plans:**
  - search, and filter by all / PRO / Free / expiring / expired / pending;
  - tap a user to see their history, add +30 or +365 days, set an end date, or end PRO.
- **Refer a Friend stats:** total referred signups, last 30 days, PRO days given, and the top 10 referrers.
- **Payment details:** bank, account name and number, and notes in Khmer and English. Users see these in the upgrade sheet.

## Referral program

- Every user has an 8-character code (in **Settings › Refer a Friend**). The share link is `https://luy.ibmserp.com/login?ref=CODE`.
- A link opened before sign-up is remembered on the device and redeemed automatically after sign-in. The code can also be typed in Settings.
- Both people get **7 days of PRO**, added on top of any current PRO period. A yearly plan stays yearly.
- Rules (in `redeem_referral`):
  - only accounts younger than 7 days can redeem;
  - each account can redeem once;
  - nobody can use their own code;
  - wrong codes share the invite-code rate limit;
  - a referrer earns at most 20 rewards per month (the friend still gets theirs).

## Deploy checklist

1. Apply the SQL: `supabase db push`, or paste `supabase_full_setup.sql` into the SQL editor. It is safe to re-run.
2. Make yourself admin (SQL above).
3. On the Droplet, add the AI key to `.env` next to `docker-compose.yml`:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

   Then run `docker compose up -d`. Without it, LuyChlat AI answers "not available" and users can still use offline tips or their own key.
4. In `/admin`, fill in **Payment details**.
5. Give yourself PRO: `/admin` › find yourself › **+365 days**.
