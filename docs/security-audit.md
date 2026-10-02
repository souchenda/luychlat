# LuyChlat security audit — October 2026

Scope: secrets, database rules (RLS), API routes, infrastructure (Docker,
Nginx, headers), and money-logic integrity. Database findings were proven
with an attack test on Postgres (PGlite) playing an owner, a family member,
a view-only member, an outsider and an anonymous visitor; the same test
passes after the fixes, together with every earlier functional test.

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | Wallet balances could be set directly (owner or family member), bypassing the ledger | **High** | Fixed |
| 2 | Members could post, edit or delete alerts (fake "X spent $500") | Medium | Fixed |
| 3 | A member could use the guest-import function to add family spending without alerting others and without the overdraft check | Medium | Fixed |
| 4 | A member could point a record's receipt at another user's file path and then read that photo | Medium | Fixed |
| 5 | Debt status / loan link and some ownership columns were writable by clients | Low | Fixed |
| 6 | Internal database helpers (incl. the balance helper) callable directly; anonymous role kept default grants | Low | Fixed |
| 7 | App port published on 0.0.0.0:3000 on the Droplet (bypasses Nginx/HTTPS and UFW) | **High** | Fixed (default 127.0.0.1) |
| 8 | No CSP / Permissions-Policy; Nginx locations with their own `add_header` dropped the security headers; `X-Powered-By` sent | Medium | Fixed |
| 9 | API routes had no rate limit, size cap or origin check (usable as a relay by other sites) | Medium | Fixed |
| 10 | `next` redirect after sign-in accepted `/\host` (open-redirect variant) | Low | Fixed |
| 11 | Supabase **secret** key was placed in `NEXT_PUBLIC_SUPABASE_ANON_KEY` on the Droplet (shipped to browsers) | **Critical** | Resolved earlier: key deleted, publishable key in use |

No secrets were ever committed to Git (full history scanned for Supabase,
JWT, Telegram, Anthropic/OpenAI, GitHub and Resend key patterns). `.gitignore`
and `.dockerignore` exclude every `.env*` file except `.env.example`.

## What was checked and is in good shape

- **RLS on all 13 tables**: workspaces, wallets_accounts, categories, transactions,
  debts, debt_repayments, notifications, telegram_settings, profiles,
  workspace_members, workspace_invites, invite_failures, budgets.
- **Isolation**: an outsider sees 0 rows in every table; the anonymous role can't
  read any table or call any function.
- **View-only members** can't add, edit or delete records or budgets (enforced in
  the database, not only hidden in the UI).
- **Receipts bucket** is private (signed URLs, 10 minutes), 5 MB, images only; uploads
  only into the user's own folder.
- **Integrity rules**: amounts > 0, currency limited to USD/KHR, a used wallet's
  currency can't change, transfers can't overdraw, repayments can't exceed what is
  owed, debt paid amount and status are always recomputed from repayments.
- **Atomicity**: repayments (`record_debt_repayment`), transfers (one row),
  reconciliation and guest import (one transaction per workspace) are atomic.
  Creating a debt *with* "move money" is two calls; if the second fails the app
  deletes the debt again, so no money can move without its debt.
- **Invite codes**: single use, 7-day expiry, 10 failed guesses per hour per user.
- **Session checks**: the middleware refreshes sessions with `auth.getUser()`.
  The two API routes don't touch the database (they relay the user's own
  Telegram/AI key), so they are protected by origin, size
  and rate instead of a session; all their input is validated with Zod.
- **XSS**: React escapes all text; the only raw HTML is the app's own boot
  script. Telegram messages escape names and notes. Excel exports write text
  cells (no formulas), and there are no CSV exports.
- **AI privacy**: only the anonymous snapshot (strict allowlist schema) leaves the
  device; keys are never stored or logged on the server.

## Fixes

Database — `supabase/migrations/20261001090000_security_hardening.sql`
(also in `supabase_full_setup.sql`):
- The balance trigger runs as the table owner; clients have no UPDATE right on
  `balance`, and the balance helper can't be called.
- Column-level UPDATE rights on every table (e.g. wallets: name, icon, colour,
  order, archive, visibility, currency; workspaces: name, currency; notifications:
  `is_read` only).
- Notifications are created by the database only.
- Guest import: workspace owners only.
- A receipt path must be in the caller's own folder.
- A debt's loan link must be that debt's own ledger row.
- No table or function access for the anonymous role.

App:
- `next.config.ts`: CSP (scripts/styles from this site; network only to this
  site and Supabase; no framing, plugins or foreign forms), HSTS, nosniff,
  X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, COOP; no
  `X-Powered-By`.
- `src/lib/server/guard.ts`: same-origin check, body cap (8 KB Telegram, 64 KB AI)
  and per-IP rate limit (10/min Telegram, 20/min AI; Cloudflare-aware).
- `/auth/callback`: only same-site paths after sign-in.

Infrastructure:
- `docker-compose.yml`: port bound to 127.0.0.1 by default; `cap_drop: ALL`,
  `no-new-privileges`, process limit. Container already runs as a non-root user.
- Nginx configs: security headers left to the app; `server_tokens off`.

## Still to do (outside the code)

1. **Apply the database fix**: run `supabase_full_setup.sql` in the Supabase SQL
   Editor (safe to re-run).
2. **Supabase › Authentication**: minimum password length 8 with letters + digits;
   enable leaked-password protection (Pro plan); keep "Confirm email" on once an
   email provider is connected; Site URL `https://luy.ibmserp.com` and redirect
   URLs limited to it; consider CAPTCHA (Turnstile) and MFA for the owner account.
3. **Supabase › API keys**: the app uses the publishable key. If the *legacy*
   `anon` / `service_role` JWT keys are still enabled and unused, disable them.
4. **Droplet**: `sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`;
   SSH with keys only (`PasswordAuthentication no`).
5. **Cloudflare**: SSL mode **Full (strict)**; optionally allow ports 80/443 only
   from Cloudflare's IP ranges.
6. **Dependencies**: `npm audit` reports PostCSS issues inside Next.js's build
   tooling (build-time only, not reachable at runtime); fixed by upgrading to
   Next 16 — plan it as a separate upgrade.
7. **Later hardening**: nonce-based CSP (removes `'unsafe-inline'` for scripts;
   requires dynamic rendering).
