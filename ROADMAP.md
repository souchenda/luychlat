# LuyChlat - Master Feature Roadmap & Task Backlog

**Last updated:** 19/10/2026 · 22:25 (Cambodia time)

The single source of truth for every feature request, idea discussed and pending backlog item, so nothing agreed is
dropped between sessions. The founder reviews it every evening.

**How to read and keep it**

- `[x]` done and live on app.luychlat.com · `[/]` in progress or pushed, awaiting deploy · `[ ]` agreed, not started.
- Each item ends with its commit(s) in brackets, checked against `git log`. An item is ticked only once it is live.
- New requests are added the day they are agreed; nothing is deleted — a dropped item is struck through with the reason.
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
- [x] Saudi Riyal (SAR) rate card & 3-way converter, Islamic Mode only (4c13cf3 — live with 3ec7978)
- [x] Iftar du'a in natural Khmer with clear phonetics — du'a library, hub card, channel caption, poster (beb9a16)
- [x] Du'a library vetted in one pass — 14 du'as, hyphenated readings, poster meanings without parentheses, notes only in captions; new: entering / leaving the mosque, travel, the fasting intention, distress (77d67ad, 047c64f)
- [ ] Halal provision, worry & debt, both worlds: not yet in the vetted style (the founder's texts pending)
- [ ] Hadith texts in the Islamic lessons and tips: review for word-for-word Khmer
- [x] Hajj & Umrah savings planner «ផែនការសន្សំសម្រាប់ធ្វើរូកូន» — calculator & 1-tap savings goal (1c0d49c)
- [x] Islamic thank-you to Yerny for the approved Kampot surau — Telegram and in-app, sent 19/10/2026 19:52 (eebe7d1)
- [x] Admin publishes an Adhan for everyone or keeps it on the device (295b194)
- [ ] Kuwait Adhan (Sheikh Ahmad Al-Trabulsi) for everyone — needs the founder's publishing permission / licence first
- [ ] Bitesize lessons screen — 8 lessons written (a0ffcd7), each needs a local Imam's / teacher's review before it shows
- [ ] Fiqh reference assistant screen — the guarded back end is live (a0ffcd7)
- [/] The founder's du'a texts vs the app's: after eating decided (Sunan Abi Dawud 3850), before eating rewritten; worry / debt still open
- [ ] Telegram bot audio Adhan alert option (to overcome iPhone locked-screen PWA limitations)

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

## 3. 🎨 ផ្ទាំងផ្សព្វផ្សាយ & មាតិកា (Media & Posters)

- [x] Dynamic Buddhist Sil Day poster (98bcf47, 21334d1)
- [x] Islamic minimalist poster engine (0c43fa7, 9c3fb09)
- [x] Full poster audit: no parentheses on any graphic, explanations only in captions; datelines «… · ត្រូវនឹង …», Imsak / Iftar cards, footer, 10 tip / lesson lines rephrased; a test guards every poster text (50cf16b)
- [x] Relatable comedy short video — Reel Ep 01 DRAFT (7e79b67, b947834)
- [ ] Reel voices: Azure AI Speech key on the Droplet (the founder declined Azure for the du'as; reels still need a licensed voice)
- [ ] Mascot master ≥ 1024 px, Facebook Page logo and cover (CLAUDE.md § E)

## 4. 💰 ហិរញ្ញវត្ថុ & ការទូទាត់ស្នូល (Core App & DL MEAT SUPPLY)

- [x] Bank slip auto-matching for DL MEAT SUPPLY ABA USD (3de602d)
- [x] Droplet disk space maintenance (38 GB free at the time)
- [x] Disk: Docker builder cache pruned — 43 GB reclaimed, 58 GB free (25 % used, 19/10/2026 21:00)
- [ ] Disk: prune the builder cache regularly (each deploy adds ~1–2 GB of cache)

## 5. 🚀 ហេដ្ឋារចនាសម្ព័ន្ធទូទាត់ឆ្លាតវៃ (Smart Merchant & Payment Infrastructure — Long-term / Future Vision)

Low urgency: the strategic direction, recorded so it is never lost. Not scheduled yet.

- [ ] **SoftPOS / Tap to Pay on Phone**: Accept contactless cards (Visa/Mastercard, Apple Pay, Google Pay) via smartphone NFC without physical POS rental.
- [ ] **In-App Dynamic KHQR & Spoken Soundbox**: Real-time voice announcement on merchant phone upon payment receipt («អេប លុយឆ្លាត បានទទួលប្រាក់...»). *Today: the SoundBox page already announces KHQR sales received through AUTOBOK; the 27 licensed Khmer voice clips are still to record.*
- [ ] **Automated Payment & Invoice Reconciliation**: Direct matching of received payments against open customer debt balances and invoices (tailored for DL MEAT SUPPLY and SME wholesalers).
- [ ] **Payment Gateway Integration (Bakong / PayWay / Stripe / 2C2P)**: Formal acquiring integration for multi-currency & card rails.
- [ ] **LuyChlat Branded Smart Soundbox & POS Hardware (OEM)**: Branded merchant hardware terminals for retail shops and distribution hubs.
