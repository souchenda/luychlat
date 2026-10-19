# LuyChlat - Master Feature Roadmap & Task Backlog

**Last updated:** 19/10/2026 · 20:40 (Cambodia time)

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
- [ ] Review the other du'as and the hadith library for word-for-word Khmer (only the Iftar du'a is done)
- [x] Hajj & Umrah savings planner «ផែនការសន្សំសម្រាប់ធ្វើរូកូន» — calculator & 1-tap savings goal (1c0d49c)
- [x] Islamic thank-you to Yerny for the approved Kampot surau — Telegram and in-app, sent 19/10/2026 19:52 (eebe7d1)
- [x] Admin publishes an Adhan for everyone or keeps it on the device (295b194)
- [ ] Kuwait Adhan (Sheikh Ahmad Al-Trabulsi) for everyone — needs the founder's publishing permission / licence first
- [ ] Bitesize lessons screen — 8 lessons written (a0ffcd7), each needs a local Imam's / teacher's review before it shows
- [ ] Fiqh reference assistant screen — the guarded back end is live (a0ffcd7)
- [ ] Three du'a texts the founder sent differ from the app's (before eating, after eating, worry / debt) — founder to decide
- [ ] Telegram bot audio Adhan alert option (to overcome iPhone locked-screen PWA limitations)

## 2. ⚙️ ប្រព័ន្ធអេដមីន & ស្វ័យប្រវត្តិកម្ម (Admin, Approval & Bot Engine)

- [x] Dedicated «LCA Approval» group (-5578121916) with custom avatar (d5065e2)
- [x] Factual feeds publish on time, silently — market bulletin 09:30–10:30 (as soon as the gold shops publish), evening NBC rates, 05:30 prayer times; no preview in the approval room (d5065e2, 84f427f)
- [x] Audit log uppercase fix for place approvals, du'a and Adhan uploads (d5f93e4 — live with 3ec7978)
- [x] Co-approvers: /addapprover as a reply in the group, and TELEGRAM_APPROVER_IDS (3ec7978, 42f2736)
- [ ] Add the founder's sister: her account → Admin › Staff (admin role, 2FA) → /addapprover reply in «LCA Approval»
- [x] Submitter thank-you DM when an approver taps [ ✅ អនុម័ត ], with the toast and «👤 ដោយ / 💌 ស្ថានភាពសារអរគុណ» card (42f2736)
- [x] Every approved suggestion thanks its member once, however it was approved (eebe7d1)
- [x] Real-time cards to «LCA Approval»: new members and place / qasidah submissions, with the [ 🌙 ឥស្លាម ] / [ ☀️ មហាជន ] badge and thanks in each member's own words (9222f3e, ff5b964)

## 3. 🎨 ផ្ទាំងផ្សព្វផ្សាយ & មាតិកា (Media & Posters)

- [x] Dynamic Buddhist Sil Day poster (98bcf47, 21334d1)
- [x] Islamic minimalist poster engine (0c43fa7, 9c3fb09)
- [x] Relatable comedy short video — Reel Ep 01 DRAFT (7e79b67, b947834)
- [ ] Reel voices: Azure AI Speech key on the Droplet (the founder declined Azure for the du'as; reels still need a licensed voice)
- [ ] Mascot master ≥ 1024 px, Facebook Page logo and cover (CLAUDE.md § E)

## 4. 💰 ហិរញ្ញវត្ថុ & ការទូទាត់ស្នូល (Core App & DL MEAT SUPPLY)

- [x] Bank slip auto-matching for DL MEAT SUPPLY ABA USD (3de602d)
- [x] Droplet disk space maintenance (38 GB free at the time)
- [ ] Disk: 20 GB free now (75 % used, 19/10/2026 20:10) — prune old Docker build images before it runs low
