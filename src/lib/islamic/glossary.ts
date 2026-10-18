/**
 * THE Islamic glossary of «អេប លុយឆ្លាត» (founder, 18/10/2026) — the single source of truth for every Islamic term
 * in the app UI, the posters, the Telegram channel captions and the AI advisor. No other file writes these words:
 * tests/golden/islamic-glossary.test.ts fails the build when one is typed elsewhere, or when a banned
 * (machine-translated) word appears anywhere. Pure, no imports.
 */

// ─── The Prophet ──────────────────────────────────────────────────────────────────────────────────
/** ﷺ (U+FDFA) — always the ligature, never spelled out (Noto Sans Arabic draws it on the posters). */
export const PBUH = "ﷺ"
export const PROPHET = "ព្យាការី មូហាំម៉ាត់"
export const PROPHET_FULL = `${PROPHET} ${PBUH}`

// ─── Fasting ──────────────────────────────────────────────────────────────────────────────────────
export const SUNNAH_FAST = "បួសស៊ុណ្ណា"
export const SAHUR = "ហូបបាយបួស"
export const SAHUR_MEAL = `${SAHUR} (សាហួរ / السَّحُور)`
export const IMSAK = "អ៊ឹមសាក់"
export const IMSAK_LABEL = `${IMSAK} (Imsak / الإمساك)`
/** On a time card. */
export const IMSAK_CARD = `${IMSAK} (Imsak)`
export const IFTAR = "ស្រាយបួស"
export const IFTAR_LABEL = `${IFTAR} (Iftar / الإفطار)`
export const IFTAR_CARD = `${IFTAR} (Iftar)`
export const NIYYAH = "នីយ៉ាត់"
export const NIYYAH_LABEL = `${NIYYAH} (Niyyah / النِّيَّة)`

/**
 * The fast reminder's poster titles. The poster is dated the day it is POSTED (Sunday / Wednesday evening) and
 * reminds of tomorrow's fast (founder, 18/10/2026 evening — replaces the afternoon's «fast-day card» dated
 * tomorrow, which readers took for today's date).
 */
export const REMINDER_TITLES = {
  monday: `រំលឹកត្រៀម${SUNNAH_FAST} ថ្ងៃច័ន្ទស្អែក (صِيَام الإِثْنَيْن)`,
  thursday: `រំលឹកត្រៀម${SUNNAH_FAST} ថ្ងៃព្រហស្បតិ៍ស្អែក (صِيَام الخَمِيس)`,
} as const

/**
 * The fast reminder poster's hero (founder, 18/10/2026 typography hotfix): short, one line, the largest text; the
 * Arabic sits centred on its own line below (never split by a line break inside the title).
 */
export const FAST_HERO_TITLES = {
  monday: `${SUNNAH_FAST} ថ្ងៃច័ន្ទ`,
  thursday: `${SUNNAH_FAST} ថ្ងៃព្រហស្បតិ៍`,
} as const
export const FAST_ARABIC = { monday: "صِيَام الإِثْنَيْن", thursday: "صِيَام الخَمِيس" } as const

/** The caption's timely first line (after «🌙»): «រំលឹកត្រៀមបួសស៊ុណ្ណា (សម្រាប់ថ្ងៃច័ន្ទ ស្អែកនេះ)៖». */
export const fastReminderLead = (weekday: "monday" | "thursday") =>
  `រំលឹកត្រៀម${SUNNAH_FAST} (សម្រាប់${weekday === "monday" ? "ថ្ងៃច័ន្ទ" : "ថ្ងៃព្រហស្បតិ៍"} ស្អែកនេះ)៖`

/** «សូមកុំភ្លេចក្រោកហូបបាយបួស (សាហួរ / السَّحُور) នៅទៀបភ្លឺ មុនម៉ោងអ៊ឹមសាក់ ០៤:២៣ និងតាំងចិត្តនីយ៉ាត់ (…) តាំងពីយប់នេះ។» */
export const sahurReminder = (imsakTime: string) =>
  `សូមកុំភ្លេចក្រោក${SAHUR_MEAL} នៅទៀបភ្លឺ មុនម៉ោង${IMSAK} ${imsakTime} និងតាំងចិត្ត${NIYYAH_LABEL} តាំងពីយប់នេះ។`

// ─── Prayers and the Quran (the channel's 24-hour posts) ──────────────────────────────────────────
/** The five daily prayers, the founder's spelling (also the app's prayer page). */
export const PRAYER_NAMES = { fajr: "ស៊ុពហ៍", dhuhr: "ហ្សូហ៊ួរ", asr: "អាសារ", maghrib: "ម៉ាហ្គ្រិប", isha: "អ៊ីស្យា" } as const
export const SURAH_AL_MULK = "Surah Al-Mulk"
export const SURAH_AL_KAHF = "Surah Al-Kahf"
export const AYAT_AL_KURSI = "Ayat al-Kursi"

// ─── Calendar, Friday, blessing ───────────────────────────────────────────────────────────────────
/** The Hijri era (هـ) — «ម.ស.» is the Buddhist Maha Sakaraj, never used for Hijri dates. */
export const HIJRI_ERA = "ហ.ស."
export const HIJRI_ERA_FULL = `ហ៊ីចរ៉ោះសករាជ (${HIJRI_ERA})`
export const JUMUAH = "ជូម៉ាអះ"
export const JUMUAH_ARABIC = "الجُمُعَة"
export const JUMUAH_LABEL = `${JUMUAH} (Jumu'ah / ${JUMUAH_ARABIC})`
export const BARAKAH = "បារ៉ាកាត់"
export const BARAKAH_LABEL = `${BARAKAH} (Barakah / بَرَكَة)`

/** Loanwords the Khmer word breaker splits («អ៊ឹម|សាក់»): posters keep them whole on a line. */
export const UNBREAKABLE_TERMS = [IMSAK, IFTAR, SAHUR, NIYYAH, SUNNAH_FAST, "ស៊ុណ្ណា", "សាហួរ", JUMUAH, BARAKAH, "មូហាំម៉ាត់", "ហ៊ីចរ៉ោះ"]

/** For the AI advisor's prompt: the terms to use when the conversation touches Islamic practice. */
export const GLOSSARY_FOR_AI = [PROPHET_FULL, SAHUR_MEAL, IMSAK_LABEL, IFTAR_LABEL, NIYYAH_LABEL, `Hijri era ${HIJRI_ERA}`, JUMUAH_LABEL, BARAKAH_LABEL].join("; ")

// ─── Banned (machine-translated or wrong) — the golden guard fails the build on any of them ──────────
export const BANNED_TERMS: { term: string; use: string }[] = [
  { term: "ឈប់ញ៉ាំ", use: IMSAK_LABEL },
  { term: "បើកបួស", use: IFTAR_LABEL },
  { term: "ស្ទូហួរ", use: SAHUR_MEAL },
  { term: "ស៊ូហួរ", use: SAHUR_MEAL },
  { term: "អាហារសាហួរ", use: SAHUR_MEAL },
  { term: "ជុមអះ", use: JUMUAH_LABEL },
  { term: "صلى الله عليه وسلم", use: PBUH },
  { term: "មហាម៉ាត់សករាជ", use: HIJRI_ERA_FULL },
]
/** Banned only in Islamic files («ម.ស.» is right for the Buddhist calendar elsewhere). */
export const BANNED_IN_ISLAMIC_FILES: { term: string; use: string }[] = [{ term: "ម.ស.", use: HIJRI_ERA }]
