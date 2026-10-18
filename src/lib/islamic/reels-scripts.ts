/**
 * Short vertical videos (Reels / TikTok, 9:16) with gentle, deadpan humour about everyday habits of Cambodian Muslims
 * (founder, 18/10/2026). The joke is always on the habit we all share (one more episode, five more minutes, a mind
 * still on the money), never on the prayer, the fast or a person; each ends on the real app and a dignified takeaway.
 *
 * Each script keeps the three acts of the video standard (CLAUDE.md) compressed to 15–20 s: (1) the relatable moment,
 * (2) the deadpan turn, (3) the resolution on the REAL app UI and the takeaway. Status DRAFT until the founder (and a
 * local Imam for the religious lines) approves it; nothing is published without the founder's ✅ (scheduled_posts).
 * Pure — the timeline and the FFmpeg plan are in reels-timeline.ts; reels-scripts.test.ts guards every line.
 */
import * as G from "@/lib/islamic/glossary"
import type { SfxId } from "@/lib/islamic/reels-audio"

export type ReelAct = "hook" | "turn" | "resolution"

export type ReelBeat = {
  act: ReelAct
  /** Seconds on screen. */
  seconds: number
  /** What the frame shows (for the frame renderer and the founder's review). */
  visual: string
  /** Kinetic typography: the lines that appear one after another (Khmer, drawn with Skia — never ffmpeg drawtext). */
  onScreen: string[]
  /** The voice-over (licensed TTS or a recorded voice only — CLAUDE.md Licensing); none = music / silence. */
  voice?: string
  /** A real screen of the app shown in this beat (captured from the app, never mocked up). */
  appScreen?: { route: string; what: string }
  /** Who speaks the voice line (the voice casting for the TTS or the recording). */
  speaker?: ReelSpeaker
  /** Ambient sound under the beat, described (licensed files only — the Adhan from the app's own licensed presets). */
  sound?: string
  /** Comedy effects: `at` seconds into the beat, or `withLine` — as that on-screen line rises in (reels-audio.ts). */
  sfx?: ({ id: SfxId; at: number } | { id: SfxId; withLine: number })[]
  /** The ambient track starting `at` seconds into the beat, under the voices (reels-audio.ts REEL_MIX). */
  ambient?: { track: "adhan"; at: number }
}

export type ReelSpeaker = "user" | "sophea" | "narrator"

/**
 * «សុភាទន្សាយ» — Sophea the Rabbit, the wise rabbit mascot of «អេប លុយឆ្លាត» in a kopiah (founder, 18/10/2026): calm,
 * deadpan, kind — she roasts the habit, never the person, and always points to the prayer and the app.
 */
export const SOPHEA = { km: "សុភាទន្សាយ", en: "Sophea the Rabbit", look: "the rabbit mascot in a green kopiah" } as const

export type ReelScript = {
  id: string
  /** The episode number in the storyboard (01 = the flagship). */
  episode: number
  title: string
  /** The founder's hook line, word for word. */
  hook: string
  /** Why it lands: the shared habit the humour is about. */
  concept: string
  beats: ReelBeat[]
  /** The source behind the takeaway, when it cites one. */
  source?: { label: string; url: string }
  /** The post's caption (Telegram / Facebook / TikTok), with the call to the app. */
  caption: string
  hashtags: string[]
  /** DRAFT → APPROVED by the founder (with a local Imam for the religious lines); only APPROVED scripts are rendered. */
  status: "DRAFT" | "APPROVED"
}

/** The length of a humour short (founder, 18/10/2026: 15–20 s). */
export const REEL_SECONDS = { min: 15, max: 20 } as const

/** A real value filled at render time from the app's own calculation (no guessing): `{imsak}` → Phnom Penh Imsak. */
export const REEL_PLACEHOLDERS = ["{imsak}"] as const

export const REEL_CTA = "📲 អេប លុយឆ្លាត — ម៉ោងសឡាត ការរំលឹកបួស និងបញ្ជីបំណុល ឥតគិតថ្លៃ 👉 app.luychlat.com"

export const REEL_SCRIPTS: ReelScript[] = [
  {
    // Episode 01 — the flagship (founder, 18/10/2026): the AI-drama binge vs Sophea the Rabbit.
    id: "sophea-ai-drama-wudu",
    episode: 1,
    title: `ញក់មើលរឿងភាគអេអាយ vs ${SOPHEA.km}ដេញទៅ${G.WUDU}`,
    hook: "សុំ ៣០ វិនាទីទៀត កំពុងដល់វគ្គតួស្រីត្រូវគេទះ...",
    concept: `Scrolling AI drama reels while the Adhan sounds — Sophea the Rabbit, deadpan, sends the viewer to make wudu.`,
    beats: [
      {
        act: "hook",
        seconds: 5,
        visual: "Night, a face lit by the phone, thumb scrolling AI drama reels; mid-scene, a slap about to land.",
        onScreen: ["សុំ ៣០ វិនាទីទៀត កំពុងដល់វគ្គតួស្រីត្រូវគេទះ..."],
        voice: "សុំ ៣០ វិនាទីទៀត កំពុងដល់វគ្គតួស្រីត្រូវគេទះ...",
        speaker: "user",
        sound: `The Adhan begins, softly (the app's licensed Adhan preset).`,
        ambient: { track: "adhan", at: 2.5 },
      },
      {
        act: "turn",
        seconds: 8,
        visual: `${SOPHEA.en} (${SOPHEA.look}) appears beside the sofa, arms folded, perfectly still; one ear twitches.`,
        onScreen: ["មើលរឿងអេអាយ គេទះកំផ្លៀងគ្នា ឯងភ័យជំនួសគេ!", `ដល់សំឡេង${G.ADHAN}ហៅ${G.SEMBAHYANG} ធ្វើមិនឮ!`, `តោះ! ក្រោកទៅ${G.WUDU}ភ្លាម!`],
        voice: `មើលរឿងអេអាយ គេទះកំផ្លៀងគ្នា ឯងភ័យជំនួសគេ! ដល់សំឡេង${G.ADHAN}ហៅ${G.SEMBAHYANG} ធ្វើមិនឮ! តោះ! ក្រោកទៅ${G.WUDU}ភ្លាម!`,
        speaker: "sophea",
        sound: `The Adhan continues under the voice.`,
        // The record scratch as Sophea appears; the thud lands after the punchline.
        sfx: [
          { id: "record_scratch", at: 0 },
          { id: "dramatic_thud", at: 7.5 },
        ],
      },
      {
        act: "resolution",
        seconds: 7,
        visual: "The phone drops on the sofa, the viewer dashes off; water from the tap for wudu; Sophea nods once.",
        onScreen: [`រឿងអេអាយគេមិនរត់ចោលទេ... តែម៉ោង${G.SEMBAHYANG}មិនចាំយើងឡើយ!`, "ពិនិត្យម៉ោងថ្វាយបង្គំលើ app.luychlat.com"],
        appScreen: { route: "/islamic", what: "today's prayer times (Phnom Penh) and the prayer-time alert with the Adhan" },
        // The dash to wudu; the chime as the call to the app rises in (its second line).
        sfx: [
          { id: "cartoon_dash", at: 0.1 },
          { id: "pop_chime", withLine: 1 },
        ],
      },
    ],
    caption: [
      `🐰 មើលរឿងអេអាយ គេទះគ្នា ឯងភ័យជំនួសគេ… ដល់${G.ADHAN} ធ្វើមិនឮ 😅`,
      "",
      `រឿងអេអាយគេមិនរត់ចោលទេ... តែម៉ោង${G.SEMBAHYANG}មិនចាំយើងឡើយ! 🕌 ពិនិត្យម៉ោងថ្វាយបង្គំលើ app.luychlat.com`,
      "",
      "💬 Tag មិត្តដែលតែងសុំ «៣០ វិនាទីទៀត» 😄",
      "",
      REEL_CTA,
    ].join("\n"),
    hashtags: ["#អេបលុយឆ្លាត", `#${G.SEMBAHYANG}`, "#MuslimCambodia"],
    status: "DRAFT",
  },
  {
    id: "ai-drama-vs-salat",
    episode: 2,
    title: "រឿងអេអាយ ភាគ ៣៨",
    hook: `ដល់ពេល${G.SEMBAHYANG}ហើយ នៅមើលរឿងអេអាយដល់ណាទៀត? ${G.SEMBAHYANG}ហើយចាំមកតភាគ!`,
    concept: "«One more episode» — the drama can wait; the prayer has its time.",
    beats: [
      {
        act: "hook",
        seconds: 5,
        visual: "Night, a face lit by the phone; the episode counter ticks 36 → 37 → 38.",
        onScreen: ["ភាគ ៣៦… ៣៧… ៣៨…", `ដល់ពេល${G.SEMBAHYANG}ហើយ នៅមើលរឿងអេអាយដល់ណាទៀត?`],
      },
      {
        act: "turn",
        seconds: 6,
        visual: "Deadpan: the thumb hovers over «next episode»; the rabbit mascot slowly raises an eyebrow.",
        onScreen: ["«ភាគនេះចប់សិន…»", `${G.SEMBAHYANG}ហើយចាំមកតភាគ!`],
      },
      {
        act: "resolution",
        seconds: 7,
        visual: "The app's prayer-time alert slides in; the phone is put face down; a prayer mat is unrolled.",
        onScreen: ["រឿងរង់ចាំបាន · សឡាតមានម៉ោងរបស់វា"],
        appScreen: { route: "/islamic", what: "the prayer-time alert «ដល់ម៉ោងសឡាត {name} ហើយ» with the Adhan" },
      },
    ],
    caption: [
      `🎬 ភាគ ៣៨ រង់ចាំបាន… ប៉ុន្តែម៉ោងសឡាតមិនរង់ចាំយើងទេ 😌`,
      "",
      "បើកការជូនដំណឹងម៉ោងសឡាតក្នុង «អេប លុយឆ្លាត» — អាហ្សានរោទ៍ដល់ម៉ោង ទោះកំពុងមើលភាគណាក៏ដោយ។",
      "",
      "💬 Tag មិត្តដែលតែងនិយាយថា «ភាគនេះចប់សិន» 😄",
      "",
      REEL_CTA,
    ].join("\n"),
    hashtags: ["#អេបលុយឆ្លាត", `#${G.SEMBAHYANG}`, "#MuslimCambodia"],
    status: "DRAFT",
  },
  {
    id: "sahur-snooze",
    episode: 3,
    title: "សុំ ៥ នាទីទៀត",
    hook: `ម៉ោងរោទ៍${G.SAHUR} ០៣:៤៥ vs សុំ ៥ នាទីទៀត`,
    concept: "The snooze button vs the pre-dawn meal — five minutes that become a whole fast on an empty stomach.",
    beats: [
      {
        act: "hook",
        seconds: 5,
        visual: "Dark room, the alarm rings at 03:45; a hand reaches out and taps «snooze».",
        onScreen: [`ម៉ោងរោទ៍${G.SAHUR} ០៣:៤៥`, "vs «សុំ ៥ នាទីទៀត»"],
      },
      {
        act: "turn",
        seconds: 6,
        visual: "Deadpan cut: the clock now reads after Imsak; then noon, a stomach growls in a quiet room.",
        onScreen: ["៥ នាទី = …", `ថ្ងៃនេះ ${G.SUNNAH_FAST}ទាំងពោះទទេ`],
      },
      {
        act: "resolution",
        seconds: 7,
        visual: "The app shows tonight's Imsak time and the 21:00 reminder on @LuyChlatIslamic.",
        onScreen: [`${G.IMSAK} {imsak} · ក្រោក${G.SAHUR}ទាន់ម៉ោង`, `${G.SAHUR} មាន${G.BARAKAH}`],
        appScreen: { route: "/islamic", what: "the day's prayer times with Imsak (Phnom Penh), and the channel's 21:00 reminder" },
      },
    ],
    source: { label: "Sahih al-Bukhari 1923", url: "https://sunnah.com/bukhari:1923" },
    caption: [
      `⏰ ០៣:៤៥ «សុំ ៥ នាទីទៀត»… ភ្ញាក់មកម្ដងទៀត ហួសម៉ោង${G.IMSAK}បាត់ 🙃`,
      "",
      `${G.PROPHET_FULL} មានប្រសាសន៍ថា ចូរ${G.SAHUR} ព្រោះក្នុង${G.SAHUR_MEAL} មាន${G.BARAKAH_LABEL} (Sahih al-Bukhari 1923)។`,
      "",
      `ម៉ោង${G.IMSAK}រាល់ថ្ងៃ (ភ្នំពេញ) នៅក្នុង «អេប លុយឆ្លាត» និងការរំលឹកម៉ោង ២១:០០ លើ @LuyChlatIslamic។`,
      "",
      "💬 Tag មិត្តដែលចុច snooze ច្រើនជាងគេ 😄",
      "",
      REEL_CTA,
    ].join("\n"),
    hashtags: ["#អេបលុយឆ្លាត", `#${G.SUNNAH_FAST}`, "#MuslimCambodia"],
    status: "DRAFT",
  },
  {
    id: "salat-mind-on-debts",
    episode: 4,
    title: "ចិត្តនៅចាំទារលុយ",
    hook: `ទៅ${G.SEMBAHYANG} តែចិត្តនៅចាំទារលុយម៉ូយ`,
    concept: "Standing in prayer while the mind counts who still owes money — write it down and pray with a quiet mind.",
    beats: [
      {
        act: "hook",
        seconds: 5,
        visual: "A calm prayer row from behind; one man's thought bubble fills with notebook pages.",
        onScreen: [`ទៅ${G.SEMBAHYANG} តែចិត្តនៅចាំទារលុយម៉ូយ`],
      },
      {
        act: "turn",
        seconds: 6,
        visual: "Deadpan: the bubbles multiply — «ជំពាក់ $៥០… ឬ $៥០០?», «សងថ្ងៃណា?» — he blinks, very still.",
        onScreen: ["ជំពាក់ $៥០… ឬ $៥០០?", "សងថ្ងៃណា?"],
      },
      {
        act: "resolution",
        seconds: 8,
        visual: "The app's debts list with the amounts and due dates; the bubbles pop; a calm face.",
        onScreen: ["កត់ទុកក្នុង អេប លុយឆ្លាត · ថ្ងៃសងរំលឹកដោយខ្លួនឯង", `ចិត្តស្ងប់ពេល${G.SEMBAHYANG}`],
        appScreen: { route: "/debts", what: "the debts list: who owes what, the due dates and the reminders" },
      },
    ],
    source: { label: "Al-Baqarah 2:282", url: "https://quran.com/2/282" },
    caption: [
      `🤲 ${G.SEMBAHYANG}… តែក្នុងចិត្តកំពុងរាប់ថា ម៉ូយជំពាក់ប៉ុន្មាន 😅`,
      "",
      "អល់ឡោះបានបង្គាប់ឱ្យកត់ត្រាបំណុល (Al-Baqarah 2:282) — កត់ទុកឱ្យច្បាស់ ចិត្តក៏ស្ងប់។",
      "",
      "«អេប លុយឆ្លាត» ចាំបំណុល ចំនួន និងថ្ងៃសងជំនួសអ្នក ហើយរំលឹកនៅថ្ងៃកំណត់។",
      "",
      "💬 Tag ម្ចាស់ហាងដែលចាំបំណុលអតិថិជនក្នុងក្បាលទាំងអស់ 😄",
      "",
      REEL_CTA,
    ].join("\n"),
    hashtags: ["#អេបលុយឆ្លាត", `#${G.SEMBAHYANG}`, "#MuslimCambodia"],
    status: "DRAFT",
  },
]

/**
 * Only a script the founder approved is rendered (founder, 18/10/2026 — tone in comedy and religion is the founder's
 * call). Rendering is not publishing: every rendered video still goes to the founder's private chat first and is
 * published only on their ✅ / 🚀 (scheduled_posts; tests/golden/publisher.test.ts).
 */
export const reelRenderable = (s: ReelScript) => s.status === "APPROVED"

/** A script's length in seconds. */
export const reelSeconds = (s: ReelScript) => s.beats.reduce((t, b) => t + b.seconds, 0)
