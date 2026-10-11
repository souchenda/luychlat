# App Luy Chlat (អេប លុយឆ្លាត) — project guidelines

The daily financial operating system for Cambodian SMEs and families. Quality, stability and effortless
use come before feature count: no half-baked features, broken links or untested edge cases.

## Engineering guardrails (founder, 11/10/2026)

1. **No silent guessing** on money, dates or calculations. State assumptions in the UI (e.g. tax rates
   are labelled as estimates to confirm with an accountant / the GDT).
2. **Cambodian 100 ៛ rounding** for riel the app *calculates or estimates* — `roundRiel()` in
   `src/lib/money.ts` (tax estimates, conversions in briefs, cost estimates). Amounts a person types or
   a bank states stay exact (`roundMoney` KHR = whole riel).
3. **Strict workspace isolation.** Business (e.g. DL MEAT SUPPLY) and Personal never leak into each
   other. Personal-only features check `type === "PERSONAL"` (not Family) in the UI *and* in RLS
   (`public.is_personal_workspace`); see `src/lib/workspace-scope.ts`.
4. **Tests before push:** `npm test` (0 failures), `npx tsc --noEmit -p .`, `npx eslint <files>`.
   Pure logic lives in `src/lib/**` with a `*.test.ts` beside it.
5. **Mobile-first:** glanceable, large touch targets, iPhone safe areas, clean Khmer typography.

## Standards

- **Brand:** Khmer «អេប លុយឆ្លាត», English «App Luy Chlat». Never «កម្មវិធី», «អែប» or a bare «LuyChlat»
  in user-facing copy (kept: URLs, `@luychlat_bot`, `LuyChlat.apk`, User-Agent tokens, code identifiers,
  and ai-guard's «កម្មវិធីកុំព្យូទ័រ» pattern). Khmer copy uses «និង», not «&».
- **Bot privacy:** the bot never shows balances or totals unless the person turned on «ឱ្យ AI មើលលេខរបស់ខ្ញុំ»
  (`telegram_links.ai_numbers`), and never in a group. 8+ digit numbers are masked in private chats.
- **Three languages:** km / en / zh in `src/lib/i18n/` (zh falls back to en).
- **Server-only code** never imports values from `"use client"` modules (`tests/server-imports.test.ts`).
- **Secrets:** never in `NEXT_PUBLIC_*`, never in chat or git; the founder enters them via the Droplet
  console. `NEXT_PUBLIC_*` are build arguments — after any `.env` edit, check `NEXT_PUBLIC_SUPABASE_URL`
  is still there. A variable reaches the container only if `docker-compose.yml` lists it.
- **Deploy:** push to `master` → the Droplet's 5-minute cron runs migrations, builds (the build runs
  `npm test`) and switches blue/green. Never push while `deploy/build-apk.sh` runs; edit
  `/opt/luysmart/.env` only while `/tmp/luysmart-deploy.lock` is free.
- **Licensing:** only licensed services and assets (no Edge-TTS or other unofficial endpoints; Khmer
  SoundBox clips via Azure AI Speech or Google Cloud TTS — `scripts/soundbox-khmer-tts.mjs`).

## Completed features — ស្ថាពរ (verified in git and on production)

### A. Telegram bot
- [x] `/bills` — active bills grouped overdue / next 7 days / later, fixed-deposit maturities apart,
  [🌐 បើកមើលវិក្កយបត្រពេញលេញ] → https://app.luychlat.com/bills; in the command menu
  (c880318, c33cf89, bc7f549).
- [x] Telegram sign-in by same-tab redirect instead of a popup; the server logs failed signatures and
  unlinked Telegrams (9e24465). Deployed and enabled — *the first successful sign-in on production
  is still to be confirmed.*
- [x] 🩺 Weekly CFO brief (Sunday 18:00, `/cfo`, `/healthcheck`) — owner's private chat, numbers on (77211f6).

### B. Home and cultural components
- [x] Pchum Ben full-screen greeting once a day — `pchum_ben_greeting_shown_date`, Cambodia date (07064ec).
- [x] Home festival card once a day — `pchum_ben_card_shown_date`, 1.5 s remount guard against flicker (6ab11bf).
- [x] Festival card redesign — sacred lotus icon, warm gold-to-lotus gradient, no watermark (5cb9590).
- [x] Two-line blessing (Khmer) on 360–390 px phones, 72 px card (09fd70b).
- [x] 🪷 Holy-day reminder with a soft synthesized temple bell — Personal only, never with Islamic Mode (f125621).

### C. Wallets and goals
- [x] Official bank logos on bank-linked goal cards instead of 🎯 (394cba0, c880318).
- [x] Chip Mong Bank fixed deposit — provider, savings-goal wallet and maturity reminder on /bills (c23c0d0).
- [x] 🚗 Vehicle documents (inspection, road tax, insurance) on /bills and /car, Personal only,
  reminders D-30 / D-15 / D-7 (d9c7c96, ded4b58).
- [x] Tax estimate helper for small taxpayers at /reports/tax, Business only (a683d7f).

### D. Mobile, PWA and Android
- [x] NSSF / card photos decoded upright (EXIF); the crop never blocks — centred ID-1 fallback (07ecfca, b942dcb).
- [x] Android adaptive launcher icons, all 5 densities, mascot at 62% of the canvas (2fe8872).
- [x] Android APK 1.1 (versionCode 2), built by `deploy/build-apk.sh`, served at
  https://app.luychlat.com/LuyChlat.apk.
- [x] Login mascot animation — 3.5 s float and breathing emerald glow (ee09adc).

### E. Brand and social assets
- [ ] Facebook Page logo (1024×1024) — *not in this repository; not verified.*
- [ ] Facebook Page cover (1640×924) — *not in this repository; not verified.*
- [ ] Mascot master at ≥ 1024 px — `public/logo.png` is 256 px; with the original in place,
  `node scripts/generate-icons.mjs` regenerates every icon sharp.
