# LuyChlat - Master Feature Roadmap & Task Backlog

**Last updated:** 25/10/2026 · 23:10 (Cambodia time)

The single source of truth for every feature request, idea discussed and pending backlog item, so nothing agreed is
dropped between sessions. The founder reviews it every evening.

**How to read and keep it**

- `[x]` done and live on app.luychlat.com · `[/]` in progress or pushed, awaiting deploy · `[ ]` agreed, not started.
- Each item ends with its commit(s) in brackets, checked against `git log`. An item is ticked only once it is live.
- New requests are added the day they are agreed; nothing is deleted — a dropped item is struck through with the reason.
- An open item that waits on someone ends with «⛔ <owner> <next step>» in Khmer — the owner is one of 🟢 (live, the founder
  tests) · 🟡 (the founder acts or approves) · ⏳ (someone outside: an Imam, a recording, a licence) · ⚙️ (engineering),
  then the one next step, e.g. «⛔ 🟡 ចុច ✅ លើកាត #833». The nightly report groups and numbers them by owner
  (CLAUDE.md › Reporting Standards; src/lib/roadmap-scorecard.ts): completed = `[x]` naming a commit deployed today;
  pending = open with today's commit or a «⛔».
- Update the **Last updated** line on every change.

---

## 1. 🕌 សហគមន៍ឥស្លាម (Islamic Community Hub)

- [x] Renamed to «សហគមន៍ ឥស្លាម» (add4608) & 1-tap 5th tab in the bottom navigation (39d6a88)
- [x] Hub home: next-prayer hero with live countdown, Imsak / Iftar on fast days, 4 quick actions, du'a of the hour (92b231b)
- [x] Top 3 Makkah Quran reciters with offline cache (2791555, f18227b)
- [x] Cambodian mosques & suraus finder with Google Maps directions (OpenStreetMap, weekly refresh)
- [x] Prayer rooms in AEON Malls 1–3, Techo and Siem Reap-Angkor airports under ស៊ូរ៉ាវ (4980e18)
- [x] Du'a audio player & admin recordings — app upload and bot /setdua (5d46fb9, 4602da9)
- [x] Daily Islamic quiz challenge (5 questions)
- [x] The quiz in the app only — the 12:30 channel teaser removed (no choices, read as clickbait); today's message deleted (f427225, 8126a43)
- [x] Saudi Riyal (SAR) rate card & 3-way converter, Islamic Mode only (4c13cf3 — live with 3ec7978)
- [x] Iftar du'a in natural Khmer with clear phonetics — du'a library, hub card, channel caption, poster (beb9a16)
- [x] Du'a library vetted in one pass — 14 du'as, hyphenated readings, poster meanings without parentheses, notes only in captions; new: entering / leaving the mosque, travel, the fasting intention, distress (77d67ad, 047c64f)
- [x] Halal provision (Ibn Majah 925), worry & debt (Bukhari 2893, Arabic corrected), both worlds (2:201) in the vetted style (7f02e42)
- [ ] Hadith texts in the Islamic lessons and tips: review for word-for-word Khmer ⛔ ⏳ អ៊ីម៉ាំពិនិត្យអត្ថបទហាឌីសជាភាសាខ្មែរពាក្យដោយពាក្យ
- [x] Hajj & Umrah savings planner «ផែនការសន្សំសម្រាប់ធ្វើរូកូន» — calculator & 1-tap savings goal (1c0d49c)
- [x] Islamic thank-you to Yerny for the approved Kampot surau — Telegram and in-app, sent 19/10/2026 19:52 (eebe7d1)
- [x] Admin publishes an Adhan for everyone or keeps it on the device (295b194)
- [x] App-wide default Adhans (regular and Fajr), one tap per track in the prayer settings and the /admin Adhan manager (dd8be5a)
- [x] «⬆️ បង្ហោះ និងកំណត់ជាសកល» — publish the phone's Adhan file and make it the default in one go (450e5e1)
- [x] Set the first global default Adhan — «អាហ្សានផ្លូវការ អេប លុយឆ្លាត» (19/10/2026), the regular and Fajr default; replaced on 25/10/2026 by the CC0 «អាហ្សានល្បឿនធម្មជាតិ» (it was the Kuwait recording — Task #499)
- [ ] Du'a recordings: none uploaded yet (card «📤 បញ្ចូលសំឡេង» or /setdua) ⛔ ⏳ អេដមីនថតសំឡេងឌុអា ហើយបញ្ចូលតាម /setdua
- [x] ~~Kuwait Adhan (Sheikh Ahmad Al-Trabulsi) for everyone~~ — dropped by the founder on 25/10/2026 (Task #499): no licensing or copyright doubt before the Play Store launch; withdrawn from the app, the alerts and the bot, the default now the bundled CC0 recording. Licensed popular voices may be negotiated once the brand is established.
- [ ] Bitesize lessons screen — 8 lessons written (a0ffcd7), each needs a local Imam's / teacher's review before it shows ⛔ ⏳ អ៊ីម៉ាំ ឬគ្រូពិនិត្យមេរៀនទាំង ៨
- [ ] Fiqh reference assistant screen — the guarded back end is live (a0ffcd7)
- [/] The founder's du'a texts vs the app's: after eating decided (Sunan Abi Dawud 3850), before eating rewritten; worry / debt still open ⛔ 🟡 ជ្រើសអត្ថបទឌុអាពេលព្រួយបារម្ភ និងពេលជំពាក់បំណុល
- [/] Telegram bot audio Adhan alert — /adhan on | off and the switch under Settings › bot prayer alerts; the app-wide default Adhan with prayer, time and place (Telegram's own notification sound rings on a locked iPhone; the Adhan plays on a tap) ⛔ 🟢 គ្រួសារបើក /adhan on ហើយបញ្ជាក់ថាឮអាហ្សាន (តេស្តបានដល់ទូរស័ព្ទទាំង ៣ ហើយ 20/10)
- [/] Prayer-time web push for Islamic Mode members (Android rings with the app closed) and counts in the prayer-alert log (949fd3e) ⛔ 🟢 បើកការជូនដំណឹងម៉ោងសឡាតលើទូរស័ព្ទ Android ហើយបញ្ជាក់ថារោទ៍ពេលបិទអេប
- [x] Native Adhan in the Android app — exact-minute alarms on the «Prayer Times Adhan» channel, screen locked, app closed (f88008f); APK 1.3 built and live at /LuyChlat.apk on 20/10 — verified 25/10/2026 23:02: the Samsung S22 and the Huawei run APK 1.11 (build 12), the Adhan per device with the off-switch hard guard (5514c3f)
- [x] The Android app offer on the prayer page — to hear the Adhan with the screen locked (677781d)
- [x] Bedtime du'a reading joins the kaf to the lam — «ប៊ីស-មី-កល់-ឡ-ហ៊ុម្ម៉ា …» (9037204) — verified 25/10/2026: approved by Nuryerny on 20/10, published every night since
- [x] Place suggestions with a photo — the approval card is the photo; the directory shows it (0264ca3)
- [x] Halal finance lesson posters: the principle and its money takeaway on every one of the 14 (a730c5f); today's lesson 13 replaced (c5c9d4c)

## 2. ⚙️ ប្រព័ន្ធអេដមីន & ស្វ័យប្រវត្តិកម្ម (Admin, Approval & Bot Engine)

- [x] Password reset by e-mail opens localhost:3000, not the app (found 29/10/2026 with the demo account): Supabase Auth's Site URL and Redirect URLs were never moved to app.luychlat.com with the domain (11/10/2026); the app already asks for app.luychlat.com — Supabase only honours a listed address — fixed by the founder 29/10/2026 (Site URL https://app.luychlat.com, Redirect URLs https://app.luychlat.com/**)
- [x] Password reset by e-mail fails when the link opens in another browser (found 29/10/2026: asked in the browser pane, the Gmail link opened in Chrome — «no place to type a new password»; the free plan's e-mail template cannot be edited): the reset is now asked with the implicit flow, the link lands on /reset-password with the session in the URL fragment and works in any browser (lib/auth/recovery-link.ts); /auth/callback redirected to https://0.0.0.0:3000 — now the real host (lib/public-origin.ts)
- [x] AUTOBOK sent the KHQR sales to the old luy.ibmserp.com/api/khqr/ingest (worked through the old domain, would stop if it lapsed): LUYCHLAT_WEBHOOK_URL → https://app.luychlat.com/api/khqr/ingest on 30/10/2026 with the founder's OK, service restarted and polling; backup /opt/autobok/env.backup-webhook-20261030 (the document URL follows it). Proved 30/10/2026 07:29: the first real sale after the change was forwarded to the app («LuyChlat Webhook — Successfully forwarded»); the founder confirms SoundBox spoke
- [ ] ibmserp.com (registered at Cloudflare, expires 08/06/2027): auto-renew is ON (checked by the founder 30/10/2026), the renewal is scheduled for 09/05/2027 (~$11.17 — Verisign's .com price rises from 1/11/2026); keep it renewed while old links, old APKs and the APK's offline «Retry» button still use it; the phone-login identities «855…@phone.luy.ibmserp.com» need no DNS (never change them) ⛔ 🟡 ០៥/០៥/២០២៧ ពិនិត្យថាកាតទូទាត់ក្នុង Cloudflare នៅមានសុពលភាព មុនបន្តដោយស្វ័យប្រវត្តិថ្ងៃ ០៩ ឧសភា
- [x] Sign-up and sign-in through Telegram (founder approved 30/10/2026; built 2/11/2026): @luychlat_bot shows one button «📱 ចុះឈ្មោះ ឬចូល» to anyone not linked — sharing their own number creates the phone account (the same 855…@phone identity as the app's phone sign-up) with Telegram linked, or signs in the account that number already has (so it also rescues a forgotten password); the answer carries «🚀 បើកអេប លុយឆ្លាត», a single-use 15-minute link that opens the app signed in (`src/lib/telegram-signup.ts`, migration `20270281000000`); a password stays optional (Settings › Security); one device per account stays ⛔ 🟢 សាកល្បងដោយ Telegram មួយដែលមិនទាន់ភ្ជាប់ (ឧ. ទូរសព្ទភរិយា)៖ ចុច /start ក្នុង @luychlat_bot › «📱 ចុះឈ្មោះ ឬចូល» › ចែករំលែក › «🚀 បើកអេប»
- [x] Sign in with Google (founder asked 2/11/2026 — «as easy as Telegram», like Spendify): the button exists, hidden in the APK (Google refuses a WebView) and switched on by NEXT_PUBLIC_AUTH_METHODS=email,google (not a secret — engineering sets it after the founder's step); a Google sign-in is a separate account from a phone account (no merge yet) ⛔ 🟢 បើកហើយ 2/11 (Google Cloud «App Luy Chlat» + Supabase): សាកចូលដោយ Google ក្នុង Chrome
- [x] Google Search in the Sunday nightly report (founder, 3/11/2026): one line — last week's clicks, impressions and the top search for luychlat.com (Search Console API, read-only, `src/lib/search-console.ts`); the key is a file on the Droplet only (/opt/luysmart/deploy/run/gsc-key.json, git-ignored) — key placed by the founder 3/11/2026, probed live from the container (token ok, 25/10–02/11: 1 click, 16 impressions) ⛔ 🟢 មើលបន្ទាត់ «Google …» ក្នុងរបាយការណ៍យប់ថ្ងៃអាទិត្យ 8/11
- [x] Dedicated «LCA Approval» group (-5578121916) with custom avatar (d5065e2)
- [x] Factual feeds publish on time, silently — market bulletin 09:30–10:30 (as soon as the gold shops publish), evening NBC rates, 05:30 prayer times; no preview in the approval room (d5065e2, 84f427f)
- [x] Audit log uppercase fix for place approvals, du'a and Adhan uploads (d5f93e4 — live with 3ec7978)
- [x] Co-approvers: /addapprover as a reply in the group, and TELEGRAM_APPROVER_IDS (3ec7978, 42f2736)
- [x] Yerny (the founder's sister, @yernysou) — content admin and co-approver in «LCA Approval» (b6b8311, 7255d99)
- [x] Role-based access: «content_admin» manages community content only; revenue, payments, subscriptions, members and settings are the founder's alone, enforced in the database (7255d99)
- [x] Staff badge and role on the admin user card; Admin Portal card on staff profiles; Admin › Staff by email or phone (0599180, 5f8a380)
- [x] Contact email for phone-registered members in «My profile» and on the admin user card — the phone sign-in never changes (5f8a380, 7255d99)
- [x] «/addapprover» accepts a reply with an @handle or a phone number with spaces (77f9a45)
- [x] Submitter thank-you DM when an approver taps [ ✅ អនុម័ត ], with the toast and «👤 ដោយ / 💌 ស្ថានភាពសារអរគុណ» card (42f2736)
- [x] Every approved suggestion thanks its member once, however it was approved (eebe7d1)
- [x] Real-time cards to «LCA Approval»: new members and place / qasidah submissions, with the [ 🌙 ឥស្លាម ] / [ ☀️ មហាជន ] badge and thanks in each member's own words (9222f3e, ff5b964)
- [x] New-member card «👤 សមាជិកថ្មីទើបបានចុះឈ្មោះ» with a welcome in the member's own words, sent quietly (77d67ad)
- [x] Post cards name who approved / published / paused and when; Staff Performance in the founder's nightly card (f3f699a)
- [x] ZERO unapproved public posts, locked — only the bulletin, NBC rates and prayer times post without a tap; a post still waiting at its time sends the founder an urgent reminder with ✅ / ❌ (7f6605c; the morning's auto-publish fallback d40d78a reverted)
- [x] REPLACE OLD WITH NEW — an improved version of today's published post is offered with 🔄 and replaces the old one (c5c9d4c)
- [x] Reports (nightly card, morning briefing, end-of-day, fuel sync, new members) to the founder's private chat only — «LCA Approval» stays an approval queue (7f02e42)
- [x] Toasts below the iPhone notch / Dynamic Island (4a2c4cd)
- [/] A note typed after a slip or entry attaches to it (5 minutes, or a reply to the card); its words set the category and «👶 សម្រាប់កូន»; [📝 បន្ថែមចំណាំ] on the slip card (1458070, 41b35c1) ⛔ 🟢 ផ្ញើស្លីបមួយ រួចវាយចំណាំក្នុង ៥ នាទី ហើយមើលថាវាភ្ជាប់
- [/] Daily Task Scorecard in the founder's nightly report — completed and stuck items with their reasons, from ROADMAP.md and today's deploys
- [/] Edit a waiting post's caption by replying to its card in «LCA Approval» — «(✏️ បានកែសម្រួលដោយ @username ម៉ោង …)» (f19e266, e297385) ⛔ 🟢 Reply លើកាតមួយ ដើម្បីសាកកែអត្ថបទ
- [/] The bot is for members only — an unlinked private chat gets the polite note and [ 📱 បង្កើតគណនីឥតគិតថ្លៃ ]; no admin bypass; the cold «not linked» text gone (e297385, fcc6987) ⛔ 🟢 សាកពី Telegram ដែលមិនទាន់ភ្ជាប់ ហើយបញ្ជាក់
- [/] The Reporting Standard — an executive summary: 3–5 highlights and «(+ X technical patches …)», one health line, 🎯 the founder's actions only (CLAUDE.md › Reporting Standards) (934c4fb) ⛔ 🟢 វាយ /report ក្នុងឆាតឯកជនជាមួយបូត ដើម្បីមើលទម្រង់ថ្មី
- [x] Approver name, @username and time on every post card after ✅ / 🚀 / ❌; per-approver counts (Staff Performance) in the founder's nightly card

## 3. 🎨 ផ្ទាំងផ្សព្វផ្សាយ & មាតិកា (Media & Posters)

- [x] Dynamic Buddhist Sil Day poster (98bcf47, 21334d1)
- [x] Islamic minimalist poster engine (0c43fa7, 9c3fb09)
- [x] Full poster audit: no parentheses on any graphic, explanations only in captions; datelines «… · ត្រូវនឹង …», Imsak / Iftar cards, footer, 10 tip / lesson lines rephrased; a test guards every poster text (50cf16b)
- [x] Relatable comedy short video — Reel Ep 01 DRAFT (7e79b67, b947834)
- [ ] Reel voices: Azure AI Speech key on the Droplet (the founder declined Azure for the du'as; reels still need a licensed voice) ⛔ 🟡 បញ្ចូល Key សំឡេងមានអាជ្ញាប័ណ្ណតាម Droplet console
- [ ] Mascot master ≥ 1024 px, Facebook Page logo and cover (CLAUDE.md § E) ⛔ 🟡 ផ្ញើឯកសារដើម Mascot ≥ 1024 px, Logo និង Cover របស់ Page
- [x] **Master Brand & Visual Design System** — `docs/BRAND_DESIGN_SYSTEM.md`, the permanent design foundation for every poster: the four pillars, royal protocol (verbatim table), Islamic terminology and two-tier colours, Sil days and festivals, daily education, the pre-flight four-layer checklist; referenced in CLAUDE.md. Evolves only on the founder's decisions (its change log)
- [/] Royal & national poster engine on the standard: official HD portrait in the golden arch, nothing above His Majesty (no crest, no logo), the brand only at the base (royal protocol), the founder's borderless kbach backdrop, palace-protocol wording (e115e42, 5b34ce3, b519f26, 48f9586, 88318cb, f9f0cb7); the drawn silhouettes removed as clipart (founder) ⛔ 🟡 ចុច ✅ លើកាត #833 (ផ្សាយ ០៥:០០ ថ្ងៃ ២៩ តុលា)
- [x] 29/10 Coronation — preview card in «LCA Approval» (48 h approval; previewed early on the founder's request), publishes 05:00 on 29/10 only after a tap (the card names the day) — verified 25/10/2026: approved by the founder on 20/10 16:44 (post #2908), publishes 29/10 05:00
- [x] National and royal holidays at 05:00; the approval card and its ✅ name the day «ផ្សាយថ្ងៃ ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក» (811c2b1)
- [/] All-inclusive holiday engine — national, Islamic, Chinese, global — every one at 05:00 (1de372a) ⛔ 🟢 ពិនិត្យកាតបុណ្យបន្ទាប់ក្នុង «LCA Approval» ថាឈ្មោះថ្ងៃ និងម៉ោង ០៥:០០ ត្រឹមត្រូវ
- [x] Strict religious separation of the channels — constitutional, golden test (87b384b)
- [x] The standard post footer — app links, the community and hashtags (the Charge+ format) (c20c09a)
- [ ] 09/11 Independence Day — preview 07/11 08:00; text design until the founder provides an official portrait of the King Father
- [ ] Water Festival (dates from the official sub-decree) — preview 48 h before at 08:00
- [ ] Official portraits of the King Father (15/10, 09/11) and the Queen Mother (18/06), from the founder ⛔ 🟡 ផ្ញើព្រះឆាយាលក្ខណ៍ផ្លូវការ HD នៃព្រះវររាជបិតា និងព្រះវររាជមាតា

## 4. 💰 ហិរញ្ញវត្ថុ & ការទូទាត់ស្នូល (Core App & DL MEAT SUPPLY)

- [x] Bank slip auto-matching for DL MEAT SUPPLY ABA USD (3de602d)
- [x] Droplet disk space maintenance (38 GB free at the time)
- [x] Disk: Docker builder cache pruned — 43 GB reclaimed, 58 GB free (25 % used, 19/10/2026 21:00)
- [x] Disk never leaks: every deploy and APK build trims the build cache to 2 GB and removes dangling images and the APK's temporary outputs; Sundays 03:00 `docker system prune` (never volumes), week-old cache, a 7-day journal, logged to the deploy log; 26 → 54 GB free on 20/10 (3d43260, d259985)
- [x] Nightly reports restored: the 23:59 end-of-day report reached no chat (no DevOps chat set) while logging «sent» — now the founder's chat; new 23:30 «📊 របាយការណ៍ប្រចាំថ្ងៃ & សុខភាព Server» card in «LCA Approval»; missed windows caught up until 06:00; /report on demand (3ed4182, ce4a4e9)
- [x] Post-deploy health-check rule in CLAUDE.md (no silent failures)
- [x] One-off morning briefing to the founder, 20/10/2026 07:00 — sent to 1 chat at 07:00:30
- [x] Deploy cards in natural Khmer to the founder's private chat after every release; «Deploy Failed» once per commit (8ea16c5, 77b258b)
- [x] Zero-downtime deploys again — two Nginx sites share the upstream (cf850c5)

## 5. 🚀 ហេដ្ឋារចនាសម្ព័ន្ធទូទាត់ឆ្លាតវៃ (Smart Merchant & Payment Infrastructure — Long-term / Future Vision)

Low urgency: the strategic direction, recorded so it is never lost. Not scheduled yet.

- [ ] **SoftPOS / Tap to Pay on Phone**: Accept contactless cards (Visa/Mastercard, Apple Pay, Google Pay) via smartphone NFC without physical POS rental.
- [ ] **In-App Dynamic KHQR & Spoken Soundbox**: Real-time voice announcement on merchant phone upon payment receipt («អេប លុយឆ្លាត បានទទួលប្រាក់...»). *Today: the SoundBox page already announces KHQR sales received through AUTOBOK; the 27 licensed Khmer voice clips are still to record.*
- [x] **Automated Payment & Invoice Reconciliation**: Direct matching of received payments against open customer debt balances and invoices (tailored for DL MEAT SUPPLY and SME wholesalers). *Done for KHQR ↔ AR (founder, 4/11/2026): a KHQR payment whose payer name matches ONE open receivable it fits into → «is this <customer>'s repayment?» [✅] [❌] in the owner's private chat; ✅ turns the sale's own income into the repayment (no second income), checked again at the tap (`lib/khqr-debt-match.ts`, migration 20270287000000). Invoices are still marked paid by hand.* ⛔ 🟢 ពេលអតិថិជនដែលជំពាក់បង់តាម KHQR សូមចុច ✅ លើសំណួរក្នុង bot
- [ ] **Payment Gateway Integration (Bakong / PayWay / Stripe / 2C2P)**: Formal acquiring integration for multi-currency & card rails.
- [ ] **LuyChlat Branded Smart Soundbox & POS Hardware (OEM)**: Branded merchant hardware terminals for retail shops and distribution hubs.

## 6. 🗺️ ផែនការឆ្លាតវៃមុន Google Play Store (Smart Roadmap to the 2027-01-01 Launch)

Approved by the founder and Gemini Spark on 24/10/2026 (RFC Task #489 → Task #490). Phases 2 and 3 **expose and polish
what is already built** (the bot's voice entries, AR/AP, the slip and invoice readers, the Zakat calculator, the gold
price) rather than build new; the three business features are new. Every rule still holds: exact money, 100 ៛ rounding
only where computed, Business / Personal apart, every sound per device (Task #488), the SoundBox isolated.

**Dates fixed by the founder (24/10/2026 — Task #491):**

- **Feature Freeze: 2026-12-15** — from then two weeks strictly for Closed Testing, bug fixes and Google Play Console
  policy compliance; no new feature merged.
- **Target Launch: 2027-01-01** — the official public launch on the Google Play Store.

Every phase is done before the freeze; a feature not live on 2026-12-14 moves after the launch, never into the freeze.

### Phase 1 — November 2026 (done by 2026-11-20): the SoundBox closes the day

- [x] Closing-summary voice clips «សរុបថ្ងៃនេះ», «និង», «ការលក់», «ដង», «អរគុណ» — made 26/10/2026 (Task #508) from translate_tts under the owner override (the 27's voice; Google Cloud TTS needed billing), in the 27 clips' exact format and loudness (mono 24 kHz MP3 64 kbps, mean −19.4 dB, x1.2 / x1.3); `scripts/soundbox-closing-override.ts` — licensed replacement later via `scripts/soundbox-closing-tts.ts`
- [x] SoundBox voice persona 👩 សំឡេងស្រី (default) / 👨 សំឡេងប្រុស — Settings › «សំឡេងអ្នកនិយាយ» (Business), per device (`soundbox_voice_gender`), «សាកល្បង» under each; the page, the app-wide voice, the server feed and the APK feed (`&voice=`, next APK) route to `public/audio/soundbox/khmer/male/` (Task #509, 26/10/2026)
- [ ] The male voice's 32 clips (27 + 5, each in x1.2 / x1.3) in `public/audio/soundbox/khmer/male/`, the 27's format and loudness, then `MALE_VOICE_READY = true` (until then male plays the female voice and Settings says so) — no licensed or authorised male Khmer voice yet (translate_tts has only a female voice; Edge-TTS banned) ⛔ 🟡 ជ្រើសប្រភពសំឡេងប្រុស៖ អ្នកថតសំឡេងជាភាសាខ្មែរ ឬ Google Cloud / Azure TTS ដែលមានអាជ្ញាប័ណ្ណ
- [x] SoundBox Daily Audio Closing Summary — «សង្ខេបលក់ពេលបិទហាង» on /soundbox (founder, 4/11/2026): switched on per phone, a closing time (21:00 by default), then once a day within the hour «សរុបថ្ងៃនេះ … រៀល និង … ដុល្លារ · ការលក់ … ដង · អរគុណ» from the clips, the same total on screen; exact sums counted by the database (soundbox_today_totals); never on Silent / Vibrate; Phase 1 plays from the SoundBox page (open, kept awake) — with the APK's screen locked the native feed does not say it yet ⛔ 🟢 បើក SoundBox › «សង្ខេបលក់ពេលបិទហាង» › ចុច «សាកស្ដាប់»
- [x] Auto-DND during prayer time — Islamic Mode devices that opt in: the SoundBox voice quiet for 15–20 min after each Adhan (Jumu'ah longer, adjustable, labelled «ប្រមាណ»); every sale still recorded and shown, then one «ទទួលបាន 3 ការលក់ …» summary after the window; the page hands the native feed plain quiet windows — the SoundBox imports no prayer code — already built (6c23e95, Task #506: SoundboxPrayerQuietWriter, opt-in per device on /islamic/prayer); this line was stale (verified 4/11/2026)

### Phase 2 — late November – early December 2026 (done by 2026-12-04): talk, remind, foresee

- [x] In-app 🎤 voice entry — the bot's Khmer voice-to-expense engine behind a mic button in the app (the same parser, the same friendly fallback): «និយាយកត់» in the new-entry sheet records up to 30 s, /api/voice-entry answers with the words heard (nothing saved or stored), the sheet is filled for the person to check and Save (`src/lib/voice-entry.ts`); feature flag voice_entry ADMIN_ONLY; the APK needs 1.15 for the microphone (RECORD_AUDIO) — browsers work now — free for everyone (founder, 4/11/2026): Free 10 a day so PRO is never slowed, PRO / ULTRA no daily cap; a slow Gemini is asked again (the bot waits up to ~3½ min), never Whisper's invented Khmer; the market shorthand «បីពាន់ប្រាំ» = 3,500 ⛔ 🟢 សាកនិយាយកត់ 3–4 ដង (ឧ. «បាយព្រឹកកូនៗ មួយម៉ឺនប្រាំពាន់រៀល»); ត្រឹមត្រូវហើយ ប្ដូរ voice_entry ទៅ PUBLIC ក្នុង Admin › Super
- [x] Personal focus (founder, 4/11/2026 — «ផ្ទាល់ខ្លួនសិន»): a slip is never lost to a reader outage (read again after 20 s / 1 min / 2 min); «💡 រកឃើញការបង់ប្រចាំខែ» on /bills (a monthly payment noticed from the person's entries, one tap to a reminder — `lib/recurring-detect.ts`); a budget warning at the moment of spending (70% / 100%, once per line — `budgetCrossing`, in the app and the bot, numbers only with «ឱ្យ AI មើលលេខ»); «recorded twice?» after a save (a slip after its voice note, or a double send — asked, never deleted silently, `public.tx_duplicate_core`) ⛔ 🟢 សាកក្នុង bot៖ និយាយ «កាហ្វេ 2 ដុល្លារ» រួចផ្ញើស្លីបនៃការបង់ដដែល — bot គួរសួរថា «ហាក់ដូចជាកត់ពីរដង»
- [x] «💰 ប្រាក់ខែចូលហើយ» (founder, 4/11/2026 — Personal): a salary recorded (bot or app) → the goal with the nearest date that still needs money this month, what it needs per month less what went in this month, never more than the salary (`lib/salary-saving.ts`); [✅ ផ្ទេរ] makes an ordinary transfer, checked again by the database (migration 20270290000000); nothing moves without the tap ⛔ 🟢 កត់ប្រាក់ខែក្នុង bot (ឧ. «ប្រាក់ខែ 500$») ពេលមានគោលដៅសន្សំដែលមានថ្ងៃកំណត់
- [x] One-tap Telegram debt reminder — from an AR debt, a polite card (`arReminderText`) the owner sends with one tap; never automatic, never in a group, no balance beyond that debt — already built (ff7b26a, Task #453): «រំលឹក» on each debt in អតិថិជនជំពាក់ (AR), the phone's share sheet (Telegram, Messenger, SMS) or Telegram's share page on a computer; this line was stale (found 4/11/2026)
- [~] 14-day cash-flow forecast — dropped (founder, 3/11/2026): «not a smart feature — it only gathers what other places already show, and it makes people miss the special ones»; the due list is «ត្រូវបង់បន្ទាប់» and /bills. Built and removed the same day (58187dd → removed); lesson: a new Home card must say something no other screen says

### Phase 3 — December 2026 (done by 2026-12-14): close the shift, know the regulars

- [~] End-of-day shift cash reconciliation — dropped (founder, 4/11/2026): counting the cash already exists — «កែតម្រូវ» on the cash wallet takes the counted cash and shows short / over; a second screen would repeat it
- [x] KHQR regular-customer insights (Business only) — «អតិថិជនទៀងទាត់» at /business/customers (founder, 4/11/2026): from the payer names on the last 90 days of KHQR payments — who comes back most (visits, totals, last visit), regulars not seen for longer than usual (twice their average gap, at least 14 days), the 3 busiest hours; public.khqr_customer_insights, the OWNER of a BUSINESS workspace only, customer payments only; never in a group or the bot ⛔ 🟢 DL MEAT SUPPLY › ម៉ឺនុយ › «អតិថិជនទៀងទាត់»
- [x] Gold-synced Nisab — the Zakat calculator follows the day's 24K gold price (local, else spot), dated, unless the person typed their own price (then one tap goes back to today's); the market card's tap no longer stores a price that goes stale (founder, 4/11/2026 — zakatGoldPrice in lib/islamic/market.ts); Islamic Mode only ⛔ 🟢 /islamic › ម៉ាស៊ីនគិតហ្សាកាត់ › មើលបន្ទាត់ «តាមតម្លៃមាស 24K ថ្ងៃ …»
- [ ] Receipt and invoice reading polish — the slip, invoice and utility-bill readers made more accurate on real photos (no new reader)

### Freeze and launch

- [ ] Feature Freeze 2026-12-15 → 2026-12-31: Closed Testing, bug fixes and Google Play Console policy compliance only (store listing, data-safety form, target API level)
- [ ] Target Launch 2027-01-01: the official public launch of «អេប លុយឆ្លាត» on the Google Play Store
