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
2. **Google Cloud Text-to-Speech** (licensed): `GOOGLE_TTS_API_KEY=… node scripts/soundbox-khmer-tts.mjs`
   — it lists Google's km-KH voices and writes the 27 files (stops if the project has none).

Then commit `public/audio/soundbox/khmer/` and deploy; the «សាកស្ដាប់» button on /soundbox plays
«ទទួលបានប្រាក់ ប្រាំម៉ឺនរៀល» from the clips. Don't use unofficial TTS endpoints or downloaded voice
packs without a licence that allows it.
