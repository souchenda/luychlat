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

## Phase 2 — the frame renderer ✅ (`src/lib/islamic/reels-renderer.ts`, `src/lib/server/reels-frames.ts`)

- **The scene (pure, tested):** for any moment, the layers — the emerald field with a wandering glow and a slowly
  drifting lattice, the gold mihrab frame, the brand; the hook's phone binging AI drama (episode counter climbing,
  the feed scrolling, a shake when the Adhan begins); Sophea popping in with an overshoot bounce, breathing, shaking
  on the record scratch, then moving up for the end card; the Adhan crescent pulsing (never over Sophea or the phone);
  speed lines with the dash; the end card (app.luychlat.com, @LuyChlatIslamic); kinetic subtitles in sync with the
  dialogue (newest rising in, earlier dialogue dimmed, Sophea's lines gold with her name, captions full).
- **Drawing:** Skia (`@napi-rs/canvas`, the posters' fonts — Khmer shaped correctly), frames streamed raw (RGBA) into
  FFmpeg's stdin — no image files; ~20 ms a frame locally.
- **Sophea's art:** `public/rabbit-kopiah.png` (1024²), cropped to its tile (`SOPHEA_ART`), gold-ringed, glowing.
- **Draft safety:** a script the founder has not approved renders with «DRAFT · មិនទាន់អនុម័ត» on every frame; every
  render writes `<out>.json` with `status: "DRAFT"`; the renderer imports nothing that publishes (golden guard).
- **CLI:** `npx tsx scripts/reels-render.ts <script-id> <out.mp4> [voices…]` (without voices: subtitles, effects and
  the Adhan).
- **Verified on production** (18/10/2026, the app container, FFmpeg 8.1, `nice 15`): Episode 01 → 20.000 s, H.264
  1080 × 1920 30 fps + AAC 48 kHz stereo, 3.4 MB, in 74 s.

## Phase 3 — voice and sound ✅ engine (`src/lib/islamic/reels-audio.ts`, `src/lib/server/reels-tts.ts`)

- **Voices: Azure AI Speech only** (the licensed service; never Edge-TTS — CLAUDE.md Licensing). Sophea:
  `km-KH-PisethNeural` (the founder's choice — Azure's male Khmer voice); the viewer and the narrator:
  `km-KH-SreymomNeural`. SSML with `rate="+5%"` (1.05×), `pitch="+4%"`, pauses after «!», «?» (320 ms), «...»
  (550 ms) and «·» (250 ms, not read aloud). A clip too long for its beat is re-spoken up to +20%, else the line is
  rewritten (`voiceRateFor`).
- **Pronunciation of «សំប៉ាយ៉ាង», «យកទឹកសំយាំង», «អាហ្សាន», «ហូបបាយបួស»:** read as written until the founder hears
  a sample; a word Azure misreads gets an SSML `<sub alias>` in `REEL_LEXICON` — tuned by ear, never guessed.
- **Sound effects** (`public/audio/sfx/`, made in-house by `scripts/reels-sfx.sh` from sine waves and noise —
  ours, no licence to track): `record_scratch` (Sophea catches the binge), `dramatic_thud` (the punchline),
  `cartoon_dash` (off to wudu), `pop_chime` (the call to the app — tied to its on-screen line, `withLine`).
  They live in `public/`, not `src/assets/`, because only `public/` reaches the server image (Dockerfile).
- **Ambient:** the app's CC0 Adhan (`public/adhan/commons-cc0-short.mp3`).
- **Mix** (`mixArgs`, one FFmpeg filtergraph): each input `adelay`ed to its cue; voices `loudnorm` −16 LUFS at
  `volume=1.0`; the Adhan at `volume=0.15`, faded out over the last 1.5 s; effects at their levels;
  `amix normalize=0`, padded and cut at the exact length (`-t`), `alimiter` 0.95; 48 kHz stereo AAC.
- **Verified on the production FFmpeg 8.1** (18/10/2026) with Episode 01's cues and stand-in voice tones: 20.000 s,
  48 kHz stereo; voices ≈ −17 dB, the Adhan under them and faded out, the effects on their cues, peak −6.9 dB.
- **Waiting for the founder:** an Azure AI Speech resource (Speech service, region e.g. `southeastasia`); the key
  and region entered on the Droplet console as `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` (listed in
  docker-compose.yml). Then the samples of the four words and the two voices, for the founder's ear.
- **Mascot:** `public/rabbit-kopiah.png` (1024 × 1024, the rabbit in a kopiah) is the master for Sophea.

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
