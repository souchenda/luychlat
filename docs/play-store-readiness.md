# Google Play readiness — App Luy Chlat (checked 15/11/2026)

Launch 2027-01-01, feature freeze 2026-12-15 (ROADMAP §6). This file lists what the current APK (1.15, build 16, targetSdk
36) would meet in review, so nothing blocks us in the last two weeks. Every policy point below must be re-read in the Play
Console at submission time — Google changes them; nothing here is a guess dressed as a fact.

## 1. Blockers — the Play build must change

| # | What | Why Play objects | Fix (engineering, before 15/12) |
|---|------|------------------|----------------------------------|
| B1 | `REQUEST_INSTALL_PACKAGES` + `AppUpdaterPlugin` (the app downloads and installs its own APK — Task #478) | Device and Network Abuse policy: an app from Play may not update itself outside Play; the permission is restricted to apps whose core purpose is installing packages | A **Play build flavour**: no permission, no updater plugin, no `/downloads` offer; Play's own in-app update instead. The sideloaded APK keeps today's updater until Play is live |
| B2 | `USE_EXACT_ALARM` (the Adhan as an alarm — Task #474) | Allowed without asking only for apps whose core function is an alarm clock or calendar; otherwise rejected | Switch to `SCHEDULE_EXACT_ALARM` (the person grants it in Settings › Alarms) with a fallback to an inexact alarm when not granted; or argue the Adhan is the alarm function (risky) |
| B3 | `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (SoundBox keep-alive prompt) | Restricted to a short list of acceptable uses; a payment announcer is not obviously on it | Keep only if the Play Console declaration is accepted; otherwise open the battery settings page (`ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`) instead of the direct prompt |

## 2. Declarations to file in the Play Console (no code change)

- **Foreground service — specialUse** (`SoundboxKeepAliveService`): «Payment announcer: keeps the connection open so an
  incoming KHQR payment is spoken aloud with the screen locked (merchant counter).» A short video of the SoundBox
  announcing a payment is usually asked for.
- **Foreground service — mediaPlayback** (`AdhanPlayerService`): «Plays the call to prayer the person scheduled.»
- **Notification access** (`BankNoticeListener`, 1.15): not a restricted manifest permission, but it reads financial
  data — covered by the User Data policy: the in-app **prominent disclosure** before Android's switch is in place
  (Settings › «កត់ត្រាពីការជូនដំណឹងធនាគារ», 15/11/2026) and must also be described in the privacy policy.
- **Location** (fine + coarse): prayer times and the place name; the fix stays on the phone (`lib/native-place.ts`).
- **Camera / microphone**: receipts, slips and cards; voice entry.

## 3. Data safety form (draft answers)

| Data type | Collected | Shared | Purpose | Notes |
|-----------|-----------|--------|---------|-------|
| Name, phone number | Yes | No | Account management | phone sign-in |
| Financial info — purchase history, other financial info | Yes | No | App functionality | entries, wallets, debts, bank notices |
| Photos | Yes (optional) | No | App functionality | receipts, slips, NSSF / card vault |
| Audio | Yes (optional) | No | App functionality | voice entry, processed then discarded — confirm retention before filing |
| Approximate / precise location | **No** (stays on the phone) | No | — | confirm no location reaches the server before filing |
| App interactions, crash logs | Yes | No | Analytics, diagnostics | client error reporter (cleaned of personal data) |

Encrypted in transit: yes (HTTPS only). Account deletion: in the app and at https://luychlat.com/delete-account.

## 4. Already fine

targetSdk 36 · HTTPS only (`allowMixedContent: false`) · old-storage permission capped at SDK 32 · a public delete-account
page · privacy policy at https://luychlat.com/privacy (add the bank-notification paragraph before filing).

## 5. Decisions for the founder

1. ✅ B1 — decided 15/11/2026, done: two builds from one code (`android/app/build.gradle` flavours). «play» has no
   `REQUEST_INSTALL_PACKAGES` and no updater (its code is in `src/sideload/` only); the page never offers it an APK
   (`storeBuild`). The bundle: `sudo bash deploy/build-apk.sh play` → `/opt/luysmart-android/play/` (private).
2. ✅ B2 — decided 15/11/2026, done: `SCHEDULE_EXACT_ALARM` in every build, `USE_EXACT_ALARM` in the sideloaded APK only;
   the Play build rings an inexact Adhan until the person allows «Alarms & reminders» (AdhanAlarmPlugin's fallback and
   settings button).
3. ⏸ B3 — shop work, after the personal-first priorities (founder's rule) — the SoundBox battery prompt becomes «open battery settings» (one extra tap for the shop), or we file the
   declaration and wait for Google's answer.
