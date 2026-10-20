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
6. **Dashboard layout (founder, 18/10/2026):** dashboard components (charts, lists, hubs) must be standalone
   siblings below the hero card, never nested inside it. The hero holds only the balance, the three stacked
   actions and the NBC / gold ticker (`tests/golden/layout-guards.test.ts`).

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
- **Commit messages in Khmer for the founder (founder, 20/10/2026):** every commit body carries one short, natural
  Khmer line (at most 80 characters, one sentence — the 3-line deploy card shows it; longer is cut with «…»)
  `Khmer: …` (e.g. `Khmer: ផ្ទាំងបន្ថែមកាបូបសាច់ប្រាក់សុទ្ធ លែងបង្ហាញជម្រើសប័ណ្ណឥណទានទៀតហើយ`) — what changed for
  the people using the app, no developer jargon. The founder's «Production (Live)» Telegram card shows it
  (`deploy/deploy-notify.sh`); a commit without one shows only its kind of change (or a line in
  `deploy/release-notes-km.tsv`).
- **Deploy:** push to `master` → the Droplet's 5-minute cron runs migrations, builds (the build runs
  `npm test`) and switches blue/green. Never push while `deploy/build-apk.sh` runs; edit
  `/opt/luysmart/.env` only while `/tmp/luysmart-deploy.lock` is free.
- **Licensing:** only licensed services and assets (no Edge-TTS or other unofficial endpoints; Khmer
  SoundBox clips via Azure AI Speech or Google Cloud TTS — `scripts/soundbox-khmer-tts.mjs`).
  **Exception — community qasidah (founder, 20/10/2026):** members may share nasheeds they found, for non-commercial
  listening in the community, under Notice & Take-down: one confirmation (authentic Islamic content), the founder's ✅
  before anything is public, and removal at once when an original owner asks. The app's own assets (Adhans, du'as,
  posters, reels, voices) stay licensed-only.

## Regression Prevention Protocol — mandatory (founder, 14/10/2026)

1. **NEVER modify shared logic without verifying dependent modules.** Before changing a shared module
   (`src/lib/**`, a database function, a store), find every caller (`grep` the export, the RPC name) and
   run their tests.
2. **Every bug fix MUST come with an automated regression test** that reproduces the bug and locks the
   expected behaviour permanently (e.g. the ABA-slip-booked-to-ACLEDA case in `bank-slip.test.ts`).
3. **Golden paths must never break** — `tests/golden/` (`npm run test:golden`):
   1. Bot receipt intake — exact amounts, never another bank's wallet by number, loans recognised.
   2. Publisher pipeline — 06:15 preview, published only with the founder's ✅ (never without), ❌ stops
      every channel, curated Facebook.
   3. SoundBox alerts — sales only, the Khmer amount, stays on, the locked-screen push.
   4. Privacy by default — balances hidden on launch, ***** never a digit, the bot masks numbers.
   5. Wallet accounting — exact money, 100 ៛ rounding only where computed, repayments ≤ what is left.
   Plus the SoundBox isolation guard (`6-soundbox-isolation.test.ts`), the home hero layout guard
   (`layout-guards.test.ts`) and the published-wording guard (`content-guards.test.ts`).
4. **Pre-deploy smoke gate:** the Dockerfile runs `npm run test:golden` before `npm test` and the build —
   one failure aborts the deploy and the running version stays live. Locally, `.githooks/pre-push`
   (`git config core.hooksPath .githooks`) runs the golden paths and the typecheck before every push.
   Never weaken or delete a golden test to make a change pass; change it only on the founder's decision.
5. **SoundBox is isolated:** `lib/soundbox.ts` imports nothing of the app, `lib/soundbox-audio.ts` only the
   SoundBox core, and no SoundBox file imports sign-in, publishing or wallet-balance code; only the
   SoundBox page uses the audio module. The guard test enforces it.
6. **MANDATORY POST-DEPLOY HEALTH CHECK (founder, 20/10/2026):** after any code deployment, container rebuild or
   system prune, the engineer must verify that all background cron jobs, schedulers and Telegram notification
   dispatchers remain active. Silent failures are strictly prohibited: a dispatcher logs how many chats really received
   a message (never a bare «sent»), and a missed time window is caught up, not skipped (the 23:59 end-of-day report
   went to no chat for days while logging «sent» — `lib/server/dev-eod.ts`, `lib/server/nightly-report.ts`).

## Publishing and content standards (founder, 12/10/2026)

- **HOLIDAY TIMING & SCOPE — locked (founder, 20/10/2026):** the holiday engine (`NATIONAL_DAYS` in
  `src/lib/calendar/cambodia-holidays.ts`) covers **national and royal, Islamic, Chinese and global** holidays in
  Cambodia. ALL holiday posters MUST be scheduled and published strictly at **05:00** Cambodia time once pre-approved
  (`PUBLISH_MINUTE`) — a holiday poster lives one day. Previewed in «LCA Approval» 48 h before (08:00), the card and its ✅
  naming the day: «✅ យល់ព្រម (ផ្សាយថ្ងៃ ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក)». Silence = HOLD + the urgent founder reminder
  (`remindFounder`). Islamic holidays go to @LuyChlatIslamic only (never the general channel or the Page); their Hijri
  dates — and a solar term such as Qingming — are flagged on the card for the approver to confirm.
- **The Master Brand & Visual Design System — inviolable (founder, 20/10/2026):** every poster engine (royal and
  national days, Islamic, Sil days and festivals, tips, lessons and quotes) follows `docs/BRAND_DESIGN_SYSTEM.md` — the
  four pillars (artwork, background, content, typography), the royal-protocol table (verbatim), the Islamic terminology
  and two-tier colours, and the pre-flight four-layer checklist before any preview. A rule changes only on the founder's
  decision, recorded in its change log.

- **No "AI slop" (ម៉ារៀលៗ).** Every line of copy, visual or media for «អេប លុយឆ្លាត» must feel
  human-crafted, grounded in real Cambodian daily life, prestigious and meaningful. Quality over
  quantity: no generic templates, no filler posts.
- **Curated, never a blind mirror** — one rule, `shouldPublishToFacebook` in
  `src/lib/server/facebook-publisher.ts` (tested):
  - 07:00 morning quote poster → Telegram Channel **and** Facebook Page.
  - MoC fuel notice → Facebook **only** when EA92 or diesel changed (Δ ≠ 0, ▲ / ▼); unchanged (or
    no known previous period) → Telegram only.
  - 20:00 nightly reminder → Telegram **only**, never the Page.
  - Holiday notes (eve 18:00, day back 07:30) and the Saturday 17:00 core-value spotlight → both.
  - National days and royal ceremonies (founder, 20/10/2026 — `lib/calendar/cambodia-holidays.ts`): a commemoration
    poster previewed 48 h before at 08:00, published at 05:00 on the day once approved → both (the card and its ✅
    name the day: «ផ្សាយថ្ងៃ ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក»). Royal portraits only
    the official ones the founder provides (never a web photo); every preview asks the approver to check the royal
    wording (រាជស័ព្ទ).
  - Tuesday / Friday 18:30 money dilemma (`lib/money-dilemmas.ts`, an open question + the app CTA) → both.
  - Buddhist Sil day (07:00 on 8 / 15 កើត, 8 រោច, ដាច់ខែ) → the branded poster (`lib/server/sil-poster.ts`) to the
    community channel **and** the Page — never @LuyChlatIslamic; the eve stays a channel note.
- **Zero public posts without the founder's approval (founder, 18/10/2026 — replaces the 12/10 auto-publish
  fallback).** Preview-first (`src/lib/server/scheduled-posts.ts`): the 07:00 poster, holiday notes and fuel
  changes reach the founder's private chat 45 min before (06:15 for 07:00) with the destination badge
  «📢 គោលដៅផ្សាយ៖ [ ✈️ Telegram Channel + 🔵 Facebook Page ]» and [ ✅ យល់ព្រម ] (published at its time),
  [ 🚀 ផុសភ្លាមៗ ] (now), [ ❌ ផ្អាកថ្ងៃនេះ ]. **ZERO UNAPPROVED PUBLIC POSTS — locked (founder, 20/10/2026, after
  the on-schedule fallback of the same morning was reverted): no post, poster or reel may ever be published
  automatically without an explicit human tap (✅ or 🚀).** Only the factual feeds from agreed official sources
  publish without a tap — the market bulletin (NBC rates, gold, fuel), the evening NBC rates and the prayer times
  (`AUTO_PUBLISH_KINDS`, below). Everything else — posters, lessons, du'as, Sil day, holidays, humour, reels — waits:
  silence = HOLD, never published by the timer, until the end of its day (Cambodia midnight), then expired unpublished.
  **Urgent founder reminder:** a post still waiting at its time triggers «🚨 ការក្រើនរំលឹកជាបន្ទាន់៖ ដល់ម៉ោងផ្សាយហើយ!»
  in the founder's private chat (never the group), again an hour later, with [ ✅ អនុម័ត និងផ្សាយឥឡូវនេះ ]
  [ ❌ ផ្អាកថ្ងៃនេះ ]; his tap publishes or pauses at once and updates his card and the «LCA Approval» card
  (`remindFounder`, `bot_post_remind_claim`). The database enforces it: `bot_post_take` lets the timer publish only
  an APPROVED post, and no auto-publish function exists (`tests/golden/publisher.test.ts`). The 12:00
  tip is posted only after the founder's «✅ អនុម័តផ្សាយ» (`bot_tip_auto_approve` is a no-op). Each post
  leaves PENDING / APPROVED once, so it is never posted twice; the channel message id and the Facebook post
  id are recorded (`scheduled_posts.telegram_message_id`, `facebook_post_id`).
- **Factual feeds on time (founder, 19/10/2026):** the market bulletin (NBC rates, gold, fuel — 09:30–10:30, as soon
  as the gold shops publish), the evening NBC rates and the 05:30 prayer times with the waking du'a are created
  APPROVED by the database (`public.post_auto_publish` = `AUTO_PUBLISH_KINDS`) and publish at their time, Telegram
  only; the preview still reaches the founder with ❌. Nothing creative, humorous or bound for Facebook is on the list.
- **The approval room «LCA Approval» (founder, 19/10/2026):** every preview goes to the approval group (set from
  inside it by a super admin with `/setapprovalgroup`, or `TELEGRAM_APPROVAL_CHAT_ID`), else `MARKETING_CHAT_ID`, else
  the super admins' private chats — never a public channel (`reviewChats`). The bot never leaves it; only a super
  admin's tap counts there.
- **Every** public post is preview-first under the same rule — also the 20:00 check-in, the Saturday spotlight,
  the market bulletin, the evening NBC rates, festival posters and holy-day notes. The channel id and the
  Facebook publish functions need a `FounderApproval` (`src/lib/server/channel.ts`), made only by the
  scheduler, the approved tip and the founder's 📢 (`tests/golden/publish-approval.test.ts`).
- **Video, reels and humour (founder, 18/10/2026 — hard rule):** never auto-published. Every rendered MP4, script
  and humour post goes to the founder's private chat first with [ ✅ យល់ព្រម ] [ 🚀 ផុសភ្លាមៗ ] [ ❌ ផ្អាក / បដិសេធ ];
  silence = HOLD; only a super admin's tap lets it out. A script the founder has not approved (`reelRenderable`)
  renders only as a draft preview with «DRAFT · មិនទាន់អនុម័ត» on every frame; every render is a DRAFT artifact
  (`<out>.json`), published by nothing in the renderer. Guard: `tests/golden/publisher.test.ts` (video sends and Facebook calls only via the approved
  publisher, the timer never publishes unapproved, the reel modules import nothing that publishes).
- **REPLACE OLD WITH NEW (founder, 20/10/2026):** whenever a content or poster update is made for a post that was already
  published on the same day, the system must delete/replace the old post with the newly approved version — never leave
  outdated or unpolished versions live. Each published post records what it published (`scheduled_posts.content_hash`);
  after a deploy, today's posts whose content changed are previewed in «LCA Approval» with [ 🔄 ជំនួសដោយកំណែថ្មី ]
  [ ❌ រក្សាកំណែចាស់ ]; on 🔄 the new version is published first, then the old message deleted from the channel (and the
  Page), and the founder is told (`replaceDue` / `checkVersions` in `src/lib/server/scheduled-posts.ts`, migration
  `20270200000000`). Still preview-first: nothing is replaced without an approver's tap or the founder's own instruction.
- **Wording guards:** never italicise Khmer in a caption (no `<i>`); banned phrases in quotes, tips and the
  spotlight fail the build (`tests/golden/content-guards.test.ts`).
- **Video (Reels / MP4), whenever added:** length follows substance — 30–60 s with a complete
  beginning and end, never cut at an arbitrary 15 s. Three acts: (1) a real Cambodian pain point
  (hesitating over a debt, shop and household money mixed, a missed loan date); (2) the resolution
  step by step on the **real** app UI (voice recording, the PPCBank loan schedule, the green K-Score
  gauge); (3) a dignified, educational takeaway. Audio: natural, rhythmic voice with proper pauses —
  licensed voices only (see Licensing), never robotic, screechy or disjointed.
  **Exception (founder, 18/10/2026):** the deadpan humour shorts for the Islamic community are 15–20 s, with the
  same three acts compressed (`src/lib/islamic/reels-scripts.ts`; the joke is on the habit, never the faith).
  Khmer text is drawn by Skia, never FFmpeg drawtext; roadmap in `docs/reels-video-engine.md`.

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
