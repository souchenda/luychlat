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
6. **Dashboard layout (founder, 18/10/2026; ACLEDA layout 21/10/2026):** dashboard components (charts, lists, hubs)
   must be standalone siblings below the hero card, never nested inside it. The hero holds only the wallet ring, the
   totals (eye toggle, USD / KHR, loans and net) and the NBC / gold ticker — no buttons: the 3×3 quick-action grid right
   below it is the one place for actions (`tests/golden/layout-guards.test.ts`).
7. **International digits (founder, 21/10/2026 — like ABA / ACLEDA):** every number on the app's screens is 0-9
   («13», «មាស 24K», «ថ្ងៃពុធ 21 តុលា 2026»), never Khmer digits beside Latin ones — app-wide (every component and page;
   the test scans them all). The shared dates (`longDate`, `dayDate`, `monthLabel`, `formatHijri`, `formatLunar`) are 0-9
   by default; post text shown on a screen goes through `latinDigits()` (`src/lib/latin-digits.test.ts`).
   **Channel posts, posters and the bot too (founder, 21/10/2026 — Task #440):** «04:23», «5,050 ៛», «21 តុលា 2026»,
   «Tirmidhi 747». Enforced where text leaves the app (`src/lib/numerals.ts`): every Telegram call (`tg`) and upload
   (`outgoingForm`), the Facebook publisher (`outgoingText`) and every poster canvas (`latinCanvas`) — a builder may still
   produce Khmer digits, they never reach a reader. **The single exception:** the official royal and national
   commemorations (`royalNumerals` — royal, national, memorial days: Coronation 29 October, Independence 9 November …) keep
   the Khmer numerals on their poster, caption and card, per palace protocol (`withKhmerDigits`, the scheduler's `scope`).

## Tone & Communication Rules (founder, 22/10/2026 — Task #469)

- **CRITICAL TONE RULE:** Always address the founder (Chenda Sou) as «បង» (Bong) in all Khmer responses, deploy
  reports, and chat messages. STRICT BAN on using «លោក» (Lork) — it is too formal and distant. Never use «លោក» in any
  situation; always «បង». This covers every message to the founder, written by the engineer or by the app (the deploy
  card, the nightly and end-of-day reports, the bot's private messages to him).

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
  **Owner override — the 27 SoundBox clips only (founder, 22/10/2026 — Task #464):** Azure sign-up was blocked, so the
  founder authorised generating `public/audio/soundbox/khmer/*.mp3` from Google Translate's free speech endpoint
  (`translate_tts`, not a licensed API). The founder accepted the risk; replace them with Azure / Google Cloud TTS or a
  Khmer speaker's recordings (same file names) when possible. **Extended to the 5 closing-summary clips (founder,
  26/10/2026 — Task #508):** `today_total`, `and`, `sales`, `times`, `thanks` (`scripts/soundbox-closing-override.ts`),
  the same voice as the 27, Google Cloud TTS needing billing. **And to the 2 welcome greeting clips (founder, 27/10/2026 —
  Task #522):** `public/audio/greeting/female/{chumreap,salam}.mp3` (`scripts/greeting-clips-override.ts`; the Salam in Arabic by
  the Arabic voice — Task #523; a native speaker's recording replaces either via `scripts/import-greeting-voice.ts`). No other asset may use that endpoint.
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
   Plus the religious channel separation guard (`holiday-channels.test.ts`), the no-pig-imagery guard (founder, 21/10/2026 —
   `islamic-no-pig.test.ts`: no piggy bank or pig emoji anywhere in the app; goals draw a target, saving a vault), the SoundBox isolation guard (`6-soundbox-isolation.test.ts`), the channel integrity guard (Task #441 — `channel-integrity.test.ts`: updates edit in place, morning posts never after 11:00, bedtime posts 19:00–23:00, 30 minutes between broadcasts), the home hero layout guard
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

## Reporting Standards — an executive summary (founder, 20–21/10/2026 — «establish app-wide standards; do not patch piecemeal»)

Every automated status report to the founder — the 23:30 nightly report (and `/report`), the 23:59 end-of-day
development report, and any status card added later — is built from `src/lib/report-standard.ts`, never ad hoc
(`report-standard.test.ts`). It must read at a glance on a phone (21/10/2026: the full lists of 20/10 were «overwhelming,
cluttered, and unreadable»):

1. **📊 Title and date**, then **🚀 Shipped today: 3–5 curated highlights** — `ROADMAP.md` items finished today, topped
   up from feature commits only when fewer than three (`curate`) — then ONE line
   `(+ X technical patches & fixes under the hood)`, X counted exactly. Never a raw commit list, never «… +N more».
2. **One health line** (`healthLine`): `🟢 System Health: 100% Healthy (Disk: 53GB free, RAM: 47%, Webhook: OK)` — 🟠 with
   what needs a look. No CPU-peak or incident log lines (they stay in Admin › Super › Development).
3. **🎯 Action Required:** short, numbered, ONLY what needs the founder's decision or approval (the 🟡 items), each a
   short imperative, the same action asked once; everything else is one count line («Also open: 9 ready to test ·
   3 with outside reviewers · 0 with engineering»).
4. **Style:** plain text, a blank line between blocks, only 📊 🚀 ✅ 🟢/🟠 🎯 (👥 for members) — no flags (a test bans
   them). A report over Telegram's 4,096 characters is a bug; `paginate` is only the safety net (numbered parts, every
   line kept), and a chat counts as reached only when every part arrived.
5. **The owner is explicit, never guessed:** in `ROADMAP.md` an open item that waits on someone ends with
   «⛔ <owner emoji> <next step>» — 🟢 live, the founder tests · 🟡 the founder acts or approves · ⏳ someone outside (an
   Imam, a recording, a licence) · ⚙️ engineering — e.g. «⛔ 🟡 ចុច ✅ លើកាត #833»; a test fails the build on any
   untagged «⛔». The release card keeps its one Khmer line.

## Publishing and content standards (founder, 12/10/2026)

- **STRICT RELIGIOUS SEPARATION — constitutional (founder, 20/10/2026: «Zero tolerance for cross-contamination»):**
  Islamic followers and non-Islamic audiences are kept strictly apart. NEVER a Buddhist day (Visak Bochea, Pchum Ben,
  Sil days), a Chinese festival (Chinese New Year, Qingming, the Hungry Ghost day, Mid-Autumn), an ancestral offering or
  a civic day in @LuyChlatIslamic; NEVER an Islamic day in the general channel or on the Page. Every holiday has a
  category and its allowed channels (`holidayCategory` / `allowedChannels` in `src/lib/calendar/cambodia-holidays.ts`);
  the dispatcher refuses any other route before sending (`holidayRouteAllowed`); `tests/golden/holiday-channels.test.ts`
  fails the build on any violation.
- **HOLIDAY TIMING & SCOPE — locked (founder, 20/10/2026):** the holiday engine (`NATIONAL_DAYS` in
  `src/lib/calendar/cambodia-holidays.ts`) covers **national and royal, Islamic, Chinese and global** holidays in
  Cambodia. ALL holiday posters MUST be scheduled and published strictly at **05:00** Cambodia time once pre-approved
  (`PUBLISH_MINUTE`) — a holiday poster lives one day. Previewed in «LCA Approval» 48 h before (08:00), its ✅
  naming the day: «✅ អនុម័ត (ផ្សាយថ្ងៃ ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក)». Silence = HOLD + the urgent founder reminder
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
  - Holiday notes (the eve and the day back, both at 05:00 — founder, 20/10/2026; previewed the evening before from
    21:30) and the Saturday 17:00 core-value spotlight → both.
  - National days and royal ceremonies (founder, 20/10/2026 — `lib/calendar/cambodia-holidays.ts`): a commemoration
    poster previewed 48 h before at 08:00, published at 05:00 on the day once approved → both (its ✅
    names the day: «ផ្សាយថ្ងៃ ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក»). Royal portraits only
    the official ones the founder provides (never a web photo); every preview asks the approver to check the royal
    wording (រាជស័ព្ទ).
  - Tuesday / Friday 18:30 money dilemma (`lib/money-dilemmas.ts`, an open question + the app CTA) → both.
  - Buddhist Sil day (07:00 on 8 / 15 កើត, 8 រោច, ដាច់ខែ) → the branded poster (`lib/server/sil-poster.ts`) to the
    community channel **and** the Page — never @LuyChlatIslamic; the eve stays a channel note.
- **Zero public posts without the founder's approval (founder, 18/10/2026 — replaces the 12/10 auto-publish
  fallback).** Preview-first (`src/lib/server/scheduled-posts.ts`): the 07:00 poster, holiday notes and fuel
  changes reach the founder's private chat 45 min before (06:15 for 07:00) with the destination badge
  «📢 គោលដៅផ្សាយ៖ [ ✈️ Telegram Channel + 🔵 Facebook Page ]» and [ ✅ អនុម័ត (ផ្សាយម៉ោង …) ] (published at its time),
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
- **Factual feeds on time (founder, 19/10/2026):** the market bulletin (NBC rates, gold, fuel — only with an NBC rate
  dated today, never yesterday's: from 08:00, out the minute today's rate and gold are in; no rate by 10:00 → held, the
  founder told on a weekday — `lib/bulletin-timing.ts`), the evening NBC rates and the 05:30 prayer times with the waking du'a are created
  APPROVED by the database (`public.post_auto_publish` = `AUTO_PUBLISH_KINDS`) and publish at their time, Telegram
  only. Nothing creative, humorous or bound for Facebook is on the list. The bulletin and the NBC rates publish
  silently; **the 05:30 prayer times keep a safety net (founder, 21/10/2026 — `SAFETY_NET_KINDS`):** still on the
  whitelist (nobody wakes at 05:00 to tap), their card reaches «LCA Approval» the evening before, from 21:30, with
  [ ❌ ផ្អាកថ្ងៃនេះ ] only (no 🚀 at night) and caption editing by reply; silence = it publishes on time. Every du'a's
  Khmer reading connects each Arabic wasl join with a hyphen, never a space (`WASL` in `src/lib/duas.test.ts`).
  **The bedtime du'a joins them (founder, 28/10/2026 — «a repetitive job, no tap needed»):** 21:00 on Tuesday and Saturday
  and every night of Ramadan (`NIGHT_DAYS` in `src/lib/islamic-channel.ts`), the app's sourced du'a, @LuyChlatIslamic only,
  no preview card.
- **The approval card — clean and thumb-friendly (founder, 21/10/2026):** a waiting card is the destination line, the
  kind and the post — no instruction lines («🔒 មិនផ្សាយទេ …», «✏️ ចុច «កែអត្ថបទ» …» are gone: the team knows silence =
  HOLD). Its keyboard: [ ✅ អនុម័ត (ផ្សាយម៉ោង …) ] full width (a later day named, «… ឥឡូវនេះ» once its time has passed) ·
  [ 🚀 ផុសភ្លាមៗ ] [ ✏️ កែអត្ថបទ ] · [ ❌ ផ្អាកថ្ងៃនេះ ] full width; never more than two buttons in a row; no ✏️ on the
  factual feeds; ✏️ edits (a «reply here» prompt), never decides. Hashtags are packed in short lines (`hashtagLines`) so
  none breaks on a phone. After every deploy the waiting cards are redrawn in place (`refreshWaitingCards`).
- **The approval room «LCA Approval» (founder, 19/10/2026):** every preview goes to the approval group (set from
  inside it by a super admin with `/setapprovalgroup`, or `TELEGRAM_APPROVAL_CHAT_ID`), else `MARKETING_CHAT_ID`, else
  the super admins' private chats — never a public channel (`reviewChats`). The bot never leaves it; only a super
  admin's tap counts there.
- **Every** public post is preview-first under the same rule — also the 20:00 check-in, the Saturday spotlight,
  the market bulletin, the evening NBC rates, festival posters and holy-day notes. The channel id and the
  Facebook publish functions need a `FounderApproval` (`src/lib/server/channel.ts`), made only by the
  scheduler, the approved tip and the founder's 📢 (`tests/golden/publish-approval.test.ts`).
- **Video, reels and humour (founder, 18/10/2026 — hard rule):** never auto-published. Every rendered MP4, script
  and humour post goes to the founder's private chat first with [ ✅ អនុម័ត ] [ 🚀 ផុសភ្លាមៗ ] [ ❌ ផ្អាក / បដិសេធ ];
  silence = HOLD; only a super admin's tap lets it out. A script the founder has not approved (`reelRenderable`)
  renders only as a draft preview with «DRAFT · មិនទាន់អនុម័ត» on every frame; every render is a DRAFT artifact
  (`<out>.json`), published by nothing in the renderer. Guard: `tests/golden/publisher.test.ts` (video sends and Facebook calls only via the approved
  publisher, the timer never publishes unapproved, the reel modules import nothing that publishes).
- **REPLACE OLD WITH NEW (founder, 20/10/2026):** whenever a content or poster update is made for a post that was already
  published on the same day, the system must delete/replace the old post with the newly approved version — never leave
  outdated or unpolished versions live. Each published post records what it published (`scheduled_posts.content_hash`);
  after a deploy, today's posts whose content changed are previewed in «LCA Approval» with [ 🔄 ជំនួសដោយកំណែថ្មី ]
  [ ❌ រក្សាកំណែចាស់ ]; on 🔄 the new version is EDITED INTO the published message (`editMessageMedia` / `editMessageText`,
  silent; the Page post's text edited) — never a delete and a new post (founder, 21/10/2026 — Task #441,
  `lib/server/edit-in-place.ts`) — and the founder is told (`replaceDue` / `checkVersions` in `src/lib/server/scheduled-posts.ts`, migration
  `20270200000000`). Still preview-first: nothing is replaced without an approver's tap or the founder's own instruction.
  **Never for what publishes on its own (founder, 28/10/2026):** every `AUTO_PUBLISH_KINDS` post (the bulletins, the NBC
  rates, the prayer times) and a fuel notice is a snapshot of its moment — never offered for replacement (`REPLACEABLE`); an
  improvement reaches the next day's post. («What I set to auto must not come back to me.»)
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
