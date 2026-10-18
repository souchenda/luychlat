# Short-video engine (Reels / TikTok, 9:16) — roadmap

Founder concept, 18/10/2026: 15–20 s vertical videos with gentle, deadpan humour about everyday habits of
Cambodian Muslims (one more episode instead of the prayer, snoozing the Sahur alarm, a mind on the money during
prayer), ending on the real app. Humour earns shares and tags; it is always on the shared habit, never on the
prayer, the fast or a person.

## Storyboard — episodes (all DRAFT until the founder approves)

| # | Script id | Title | Habit | Ends on |
|---|-----------|-------|-------|---------|
| 01 ⭐ | `sophea-ai-drama-wudu` | «ញក់មើលរឿងភាគអេអាយ vs សុភាទន្សាយដេញទៅយកទឹកសំយាំង» | scrolling AI dramas through the Adhan; Sophea the Rabbit (kopiah) roasts, deadpan, and sends the viewer to make wudu | /islamic prayer times + alert |
| 02 | `ai-drama-vs-salat` | «រឿងអេអាយ ភាគ ៣៨» | one more episode vs the prayer | /islamic prayer alert |
| 03 | `sahur-snooze` | «សុំ ៥ នាទីទៀត» | snoozing the Sahur alarm | /islamic Imsak time |
| 04 | `salat-mind-on-debts` | «ចិត្តនៅចាំទារលុយ» | counting debts during the prayer | /debts |

**Sophea the Rabbit («សុភាទន្សាយ»)** — the app's rabbit mascot in a green kopiah: calm, deadpan, kind; she roasts the
habit, never the person. Voice casting: a calm female Khmer voice (licensed TTS or recorded). Episode 01 needs her
layered artwork (body, ears, eyes, folded arms) at ≥ 1024 px.

Episodes 01 and 02 share the AI-drama theme — the founder may keep both (different jokes) or merge 02 into 01.

## Phase 1 — scripts and the pure engine core ✅ (this commit)

- `src/lib/islamic/reels-scripts.ts` — the script registry: three scripts (the founder's hooks word for word),
  each in three acts (hook → deadpan turn → resolution on a **real** app screen + takeaway), 15–20 s, a caption with
  the call to the app, cited sources (Bukhari 1923, Al-Baqarah 2:282) and `status: "DRAFT"`.
- `src/lib/islamic/reels-timeline.ts` — the timeline of kinetic-typography cues (reading time per Khmer line,
  ease-out rise-in), the checks a script must pass before rendering (`reelProblems`), placeholders filled from the
  app's own values (`{imsak}` from `lib/prayer.ts`, never guessed), and the FFmpeg arguments.
- Tests: `reels-scripts.test.ts`; Islamic terms come from the glossary (`SEMBAHYANG` «សំប៉ាយ៉ាង» added).

## Phase 2 — the frame renderer (Skia)

- `src/lib/server/reel-frames.ts`: draws each of the `frameCount(script)` frames (1080 × 1920, 30 fps) with
  `@napi-rs/canvas` — the posters' fonts (MiSans Khmer, Amiri for Arabic), the emerald / gold frame, the cues
  at `cueProgress(cue, t)` (opacity + 40 px rise), inside `REEL_FORMAT.safe` (clear of the platform buttons).
- **Why Skia and not FFmpeg `drawtext`:** drawtext does not shape Khmer subscripts and vowels reliably; Skia does
  (the posters prove it). FFmpeg only encodes images and sound.
- **Mascot:** the rabbit needs a master at ≥ 1024 px (today `public/logo.png` is 256 px — CLAUDE.md E). Simple
  motion (float, blink, eyebrow raise) is drawn as transforms of layered PNGs (body, eyes, brows) the founder supplies.
- **Real app screens:** captured from the running app (Playwright, a demo workspace with demo data — never a real
  user's data, balances hidden), then placed in a phone frame. Never mocked up (CLAUDE.md video standard).

## Phase 3 — voice and sound (licensed only)

- Khmer voice-over: Azure AI Speech (`km-KH` neural voices) or Google Cloud TTS, or a recorded human voice —
  natural pauses, never robotic (CLAUDE.md Licensing). The key is the founder's, entered on the Droplet console.
- Music / effects: royalty-free with a licence on file. No Quran recitation unless the recording's licence allows
  this use; the Adhan only from the licensed files already in the app.

## Phase 4 — rendering on the Droplet

- `ffmpeg` 8.1 is already in the runner image (Dockerfile). A render job: frames into a temp dir → `ffmpeg
  ${ffmpegArgs(...)}` → MP4 (H.264 / AAC, yuv420p, +faststart) → stored, temp dir removed.
- One render at a time, low priority (`nice`), never while `deploy/build-apk.sh` or a deploy build runs
  (`/tmp/luysmart-deploy.lock`); ~600 frames × ~40 ms ≈ 25 s of drawing + a few seconds of encoding.

## Phase 5 — publishing (preview-first, as every public post)

- The rendered MP4 goes to the founder's private chat with the destination badge and ✅ / 🚀 / ❌, exactly as the
  posters (`scheduled_posts`, a new kind); published only with a `FounderApproval` (CLAUDE.md, golden test
  `publish-approval.test.ts`): Telegram `sendVideo` to @LuyChlatIslamic, Facebook Reels via the Page API.
- A script is rendered only when `status: "APPROVED"` (the founder, with a local Imam for the religious lines).

## Open decisions for the founder

1. Approve (or edit) the three scripts' on-screen lines and captions — they are DRAFT.
2. The mascot master and its layers (≥ 1024 px).
3. Voice: Azure or Google (key on the Droplet console), or a recorded voice.
4. TikTok: publish by hand from the MP4, or apply for the TikTok Content Posting API.
