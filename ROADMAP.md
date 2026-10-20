# LuyChlat - Master Feature Roadmap & Task Backlog

**Last updated:** 20/10/2026 · 17:45 (Cambodia time)

The single source of truth for every feature request, idea discussed and pending backlog item, so nothing agreed is
dropped between sessions. The founder reviews it every evening.

**How to read and keep it**

- `[x]` done and live on app.luychlat.com · `[/]` in progress or pushed, awaiting deploy · `[ ]` agreed, not started.
- Each item ends with its commit(s) in brackets, checked against `git log`. An item is ticked only once it is live.
- New requests are added the day they are agreed; nothing is deleted — a dropped item is struck through with the reason.
- An open item that is blocked ends with «⛔ reason» in Khmer — the founder's nightly Daily Task Scorecard shows it
  (src/lib/roadmap-scorecard.ts): completed = `[x]` naming a commit deployed today; stuck = open with today's commit or a «⛔».
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
- [ ] Hadith texts in the Islamic lessons and tips: review for word-for-word Khmer ⛔ រង់ចាំការពិនិត្យពីអ៊ីម៉ាំ
- [x] Hajj & Umrah savings planner «ផែនការសន្សំសម្រាប់ធ្វើរូកូន» — calculator & 1-tap savings goal (1c0d49c)
- [x] Islamic thank-you to Yerny for the approved Kampot surau — Telegram and in-app, sent 19/10/2026 19:52 (eebe7d1)
- [x] Admin publishes an Adhan for everyone or keeps it on the device (295b194)
- [x] App-wide default Adhans (regular and Fajr), one tap per track in the prayer settings and the /admin Adhan manager (dd8be5a)
- [x] «⬆️ បង្ហោះ និងកំណត់ជាសកល» — publish the phone's Adhan file and make it the default in one go (450e5e1)
- [x] Set the first global default Adhan — «អាហ្សានផ្លូវការ អេប លុយឆ្លាត» (19/10/2026), the regular and Fajr default
- [ ] Du'a recordings: none uploaded yet (card «📤 បញ្ចូលសំឡេង» or /setdua) ⛔ រង់ចាំការថតសំឡេងឌុអាពីអេដមីន
- [ ] Kuwait Adhan (Sheikh Ahmad Al-Trabulsi) for everyone — needs the founder's publishing permission / licence first ⛔ រង់ចាំការអនុញ្ញាត / អាជ្ញាប័ណ្ណ
- [ ] Bitesize lessons screen — 8 lessons written (a0ffcd7), each needs a local Imam's / teacher's review before it shows ⛔ រង់ចាំការពិនិត្យពីអ៊ីម៉ាំ
- [ ] Fiqh reference assistant screen — the guarded back end is live (a0ffcd7)
- [/] The founder's du'a texts vs the app's: after eating decided (Sunan Abi Dawud 3850), before eating rewritten; worry / debt still open ⛔ រង់ចាំស្ថាបនិកសម្រេចអត្ថបទឌុអា ទុក្ខ និងបំណុល
- [/] Telegram bot audio Adhan alert — /adhan on | off and the switch under Settings › bot prayer alerts; the app-wide default Adhan with prayer, time and place (Telegram's own notification sound rings on a locked iPhone; the Adhan plays on a tap) ⛔ រង់ចាំគ្រួសារបើក /adhan on — តេស្តអាហ្សានបានដល់ទូរស័ព្ទទាំង ៣ ហើយ (20/10)
- [/] Prayer-time web push for Islamic Mode members (Android rings with the app closed) and counts in the prayer-alert log (949fd3e)
- [/] Native Adhan in the Android app — exact-minute alarms on the «Prayer Times Adhan» channel, screen locked, app closed (f88008f) ⛔ រង់ចាំការសាងសង់ APK 1.2 (deploy/build-apk.sh)
- [x] Place suggestions with a photo — the approval card is the photo; the directory shows it (0264ca3)
- [x] Halal finance lesson posters: the principle and its money takeaway on every one of the 14 (a730c5f); today's lesson 13 replaced (c5c9d4c)

## 2. ⚙️ ប្រព័ន្ធអេដមីន & ស្វ័យប្រវត្តិកម្ម (Admin, Approval & Bot Engine)

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
- [/] A note typed after a slip or entry attaches to it (5 minutes, or a reply to the card); its words set the category and «👶 សម្រាប់កូន»; [📝 បន្ថែមចំណាំ] on the slip card (1458070, 41b35c1)
- [/] Daily Task Scorecard in the founder's nightly report — completed and stuck items with their reasons, from ROADMAP.md and today's deploys
- [x] Approver name, @username and time on every post card after ✅ / 🚀 / ❌; per-approver counts (Staff Performance) in the founder's nightly card

## 3. 🎨 ផ្ទាំងផ្សព្វផ្សាយ & មាតិកា (Media & Posters)

- [x] Dynamic Buddhist Sil Day poster (98bcf47, 21334d1)
- [x] Islamic minimalist poster engine (0c43fa7, 9c3fb09)
- [x] Full poster audit: no parentheses on any graphic, explanations only in captions; datelines «… · ត្រូវនឹង …», Imsak / Iftar cards, footer, 10 tip / lesson lines rephrased; a test guards every poster text (50cf16b)
- [x] Relatable comedy short video — Reel Ep 01 DRAFT (7e79b67, b947834)
- [ ] Reel voices: Azure AI Speech key on the Droplet (the founder declined Azure for the du'as; reels still need a licensed voice) ⛔ រង់ចាំ Key សំឡេងមានអាជ្ញាប័ណ្ណ
- [ ] Mascot master ≥ 1024 px, Facebook Page logo and cover (CLAUDE.md § E) ⛔ រង់ចាំឯកសារដើមពីស្ថាបនិក
- [x] **Master Brand & Visual Design System** — `docs/BRAND_DESIGN_SYSTEM.md`, the permanent design foundation for every poster: the four pillars, royal protocol (verbatim table), Islamic terminology and two-tier colours, Sil days and festivals, daily education, the pre-flight four-layer checklist; referenced in CLAUDE.md. Evolves only on the founder's decisions (its change log)
- [/] Royal & national poster engine on the standard: official HD portrait in the golden arch, nothing above His Majesty (no crest, no logo), the brand only at the base (royal protocol), the founder's borderless kbach backdrop, palace-protocol wording (e115e42, 5b34ce3, b519f26, 48f9586, 88318cb, f9f0cb7); the drawn silhouettes removed as clipart (founder) ⛔ រង់ចាំស្ថាបនិកអនុម័តកាត #833
- [/] 29/10 Coronation — preview card in «LCA Approval» (48 h approval; previewed early on the founder's request), publishes 05:00 on 29/10 only after a tap (the card names the day) ⛔ រង់ចាំស្ថាបនិកចុច ✅ លើកាត #833
- [x] National and royal holidays at 05:00; the approval card and its ✅ name the day «ផ្សាយថ្ងៃ ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក» (811c2b1)
- [/] All-inclusive holiday engine — national, Islamic, Chinese, global — every one at 05:00 (1de372a)
- [/] Strict religious separation of the channels — constitutional, golden test (87b384b)
- [ ] 09/11 Independence Day — preview 07/11 08:00; text design until the founder provides an official portrait of the King Father
- [ ] Water Festival (dates from the official sub-decree) — preview 48 h before at 08:00
- [ ] Official portraits of the King Father (15/10, 09/11) and the Queen Mother (18/06), from the founder ⛔ រង់ចាំរូបផ្លូវការពីស្ថាបនិក

## 4. 💰 ហិរញ្ញវត្ថុ & ការទូទាត់ស្នូល (Core App & DL MEAT SUPPLY)

- [x] Bank slip auto-matching for DL MEAT SUPPLY ABA USD (3de602d)
- [x] Droplet disk space maintenance (38 GB free at the time)
- [x] Disk: Docker builder cache pruned — 43 GB reclaimed, 58 GB free (25 % used, 19/10/2026 21:00)
- [/] Disk: weekly Docker clean-up, Sundays 02:00 — week-old build cache and dangling images, logged to /var/log/luysmart-prune.log (deploy/weekly-prune.sh)
- [x] Nightly reports restored: the 23:59 end-of-day report reached no chat (no DevOps chat set) while logging «sent» — now the founder's chat; new 23:30 «📊 របាយការណ៍ប្រចាំថ្ងៃ & សុខភាព Server» card in «LCA Approval»; missed windows caught up until 06:00; /report on demand (3ed4182, ce4a4e9)
- [x] Post-deploy health-check rule in CLAUDE.md (no silent failures)
- [x] One-off morning briefing to the founder, 20/10/2026 07:00 — sent to 1 chat at 07:00:30
- [x] Deploy cards in natural Khmer to the founder's private chat after every release; «Deploy Failed» once per commit (8ea16c5, 77b258b)
- [x] Zero-downtime deploys again — two Nginx sites share the upstream (cf850c5)

## 5. 🚀 ហេដ្ឋារចនាសម្ព័ន្ធទូទាត់ឆ្លាតវៃ (Smart Merchant & Payment Infrastructure — Long-term / Future Vision)

Low urgency: the strategic direction, recorded so it is never lost. Not scheduled yet.

- [ ] **SoftPOS / Tap to Pay on Phone**: Accept contactless cards (Visa/Mastercard, Apple Pay, Google Pay) via smartphone NFC without physical POS rental.
- [ ] **In-App Dynamic KHQR & Spoken Soundbox**: Real-time voice announcement on merchant phone upon payment receipt («អេប លុយឆ្លាត បានទទួលប្រាក់...»). *Today: the SoundBox page already announces KHQR sales received through AUTOBOK; the 27 licensed Khmer voice clips are still to record.*
- [ ] **Automated Payment & Invoice Reconciliation**: Direct matching of received payments against open customer debt balances and invoices (tailored for DL MEAT SUPPLY and SME wholesalers).
- [ ] **Payment Gateway Integration (Bakong / PayWay / Stripe / 2C2P)**: Formal acquiring integration for multi-currency & card rails.
- [ ] **LuyChlat Branded Smart Soundbox & POS Hardware (OEM)**: Branded merchant hardware terminals for retail shops and distribution hubs.
