# SoundBox — Khmer audio clips

iPhones (and many Android phones) have no Khmer text-to-speech voice, so the SoundBox speaks Khmer
by joining 27 short recordings: «ទទួលបានប្រាក់ ពីរម៉ឺនរៀល» = `received` + `2` + `meun` + `riel`.

Put them in `public/audio/soundbox/khmer/` as MP3 (mono, 22–48 kHz, ~64–128 kbps), one word per
file, **trimmed tight** (no silence before or after — the app plays them back to back), all at the
same loudness. Until all 27 are there, Khmer falls back to a device Khmer voice, else English.

| File | Says | File | Says | File | Says |
|---|---|---|---|---|---|
| `received.mp3` | ទទួលបានប្រាក់ | `10.mp3` | ដប់ | `roy.mp3` | រយ |
| `1.mp3` | មួយ | `20.mp3` | ម្ភៃ | `poan.mp3` | ពាន់ |
| `2.mp3` | ពីរ | `30.mp3` | សាមសិប | `meun.mp3` | ម៉ឺន |
| `3.mp3` | បី | `40.mp3` | សែសិប | `saen.mp3` | សែន |
| `4.mp3` | បួន | `50.mp3` | ហាសិប | `lean.mp3` | លាន |
| `5.mp3` | ប្រាំ | `60.mp3` | ហុកសិប | `riel.mp3` | រៀល |
| `6.mp3` | ប្រាំមួយ | `70.mp3` | ចិតសិប | `dollar.mp3` | ដុល្លារ |
| `7.mp3` | ប្រាំពីរ | `80.mp3` | ប៉ែតសិប | `cent.mp3` | សេន |
| `8.mp3` | ប្រាំបី | `90.mp3` | កៅសិប | | |
| `9.mp3` | ប្រាំបួន | | | | |

Two ways to make them:

1. **Record** (best): one Khmer speaker, a quiet room, the phone's voice recorder; say each word
   clearly at the same pace; trim and export as MP3 with the names above.
2. **Azure AI Speech** (licensed; chosen 11/10/2026 — voice km-KH-SreymomNeural, Free F0 tier):
   `AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=southeastasia node scripts/soundbox-khmer-tts.mjs`
   — checks the key, lists Azure's km-KH voices and writes the 27 files. Never Edge-TTS (Edge's
   read-aloud service is not licensed for other apps).
3. **Google Cloud Text-to-Speech** (licensed): `GOOGLE_TTS_API_KEY=… node scripts/soundbox-khmer-tts.mjs`
   — it lists Google's km-KH voices and writes the 27 files (stops if the project has none).

Then commit `public/audio/soundbox/khmer/` and deploy; the «សាកស្ដាប់» button on /soundbox plays
«ទទួលបានប្រាក់ ប្រាំម៉ឺនរៀល» from the clips. Don't use unofficial TTS endpoints or downloaded voice
packs without a licence that allows it.

## Current clips (22/10/2026 — Task #464, owner override)

The 27 files in `public/audio/soundbox/khmer/` were generated from Google Translate's free speech endpoint
(`translate.google.com/translate_tts`, `tl=km`) on the founder's explicit authorisation, after Azure sign-up was
blocked. That endpoint is not a licensed API: replace the files with Azure AI Speech, Google Cloud TTS
(`scripts/soundbox-khmer-tts.mjs`) or a Khmer speaker's recordings when possible — the same 27 file names, nothing else
to change.

## Closing-summary clips (24/10/2026 — Task #490, Phase 1)

The daily closing summary says «សរុបថ្ងៃនេះ 1,200,000 រៀល និង 45 ដុល្លារ · ការលក់ 23 ដង · អរគុណ»: the amounts and the
count come from the 27, plus five words of its own (`CLOSING_WORDS` in `src/lib/soundbox.ts`):

| File | Says |
|---|---|
| `today_total.mp3` | សរុបថ្ងៃនេះ |
| `and.mp3` | និង |
| `sales.mp3` | ការលក់ |
| `times.mp3` | ដង |
| `thanks.mp3` | អរគុណ |

**Current files (26/10/2026 — Task #508, owner override):** Google Cloud TTS needs billing on the founder's project, so he
extended the Task #464 override to these five: they come from `translate_tts` (the same voice as the 27), made by
`npx tsx scripts/soundbox-closing-override.ts` in the exact format below (1.0x mean −19.4 / −19.5 dB). Replace them with
licensed audio when possible — the same file names.

The licensed way, in your own terminal with your own key (never committed, never pasted in chat):

    GOOGLE_TTS_API_KEY=… npx tsx scripts/soundbox-closing-tts.ts

It needs ffmpeg (on the PATH, `FFMPEG=<path>`, or `npm i --no-save ffmpeg-static`). Each word is synthesized losslessly,
then made exactly like the 27 (`src/lib/soundbox-clips.ts`, measured on them 24/10/2026): trimmed at −45 dB with 15 ms
before and 20 ms after, brought to their median loudness (mean −19 dB), limited at their loudest peak (−2 dB), mono
24 kHz MP3 at 64 kbps without tags, then `x1.2/` and `x1.3/` with atempo. The script prints each clip's loudness and
stops (exit 1) if one is off by more than 1 dB. Listen to them joined with the 27 before committing.
