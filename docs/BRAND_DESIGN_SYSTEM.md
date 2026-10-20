# «អេប លុយឆ្លាត» Master Brand & Visual Design System

**Status:** permanent, binding on every poster engine and every person or AI working on them (founder, 20/10/2026).
**Owner:** the founder. Change a rule only on the founder's decision; record the date and the reason here.

> «A poster is not just artwork, nor content, nor design — it is the complete synthesis of all of them, so that
> App Luy Chlat stands as a unique, prestigious, top-tier national brand.» — the founder, 20/10/2026

This document is the single reference for national holiday, royal ceremony, religious, cultural and daily-education
posters. It records the founder's decisions. Code and tests enforce them where they can (listed with each rule). Where
this document and the code disagree, the code has drifted: fix the code, or bring the question to the founder.

---

## Chapter 1 — The four pillars

Every poster is judged on all four together. A beautiful image with one wrong word fails, and so does perfect wording
on a flat, careless background.

| Pillar | What it means | Never |
|---|---|---|
| **1. Artwork** | Official, high-resolution imagery, or motifs drawn by the app itself (lotus, line art), never architecture. Every image is sharp at 1080 px, cleanly cropped, centred, with no stray pixels. | Web photos, candid snapshots, screenshots, watermarked or unlicensed images, AI-generated likenesses of real people. |
| **2. Background** | Depth with dignity: the brand's deep emerald gradient, a soft vignette, and subtle cultural or national layers at 15–20 % opacity. | A flat wall, loud patterns, layers that compete with the text, hard-edged bands. |
| **3. Content** | Correct, verified and respectful: royal protocol, religious terminology, real dates, everyday Cambodian life. Every word earns its place. | Guessed dates, invented honorifics, «AI slop», filler, money lectures on a merit day. |
| **4. Typography** | Clean Khmer type (MiSans Khmer, Kantumruy Pro fallback; Amiri only for whole Arabic lines), a clear hierarchy, centred and balanced lines. No compound word is ever split across lines. | Italic Khmer, parentheses on a graphic, «…» cuts, orphaned words, «&» in Khmer copy (use «និង»). |

**Shared brand frame:** every poster carries «អេប លុយឆ្លាត» with the mascot (top left) and the footer
«អេប លុយឆ្លាត · app.luychlat.com», or the shared frame of `src/lib/server/poster-kit.ts`. **Except royal posters:**
there the brand appears only at the bottom (§ 2.1). Write the brand as
«អេប លុយឆ្លាត» / «App Luy Chlat», never «កម្មវិធី», «អែប» or a bare «LuyChlat».

---

## Chapter 2 — Royal & National Ceremonies

Engines: `src/lib/calendar/cambodia-holidays.ts` holds the days and the wording; `src/lib/server/national-day-poster.ts`
renders the poster. With a portrait the poster is 1080 × 1350; without one it is 1080 × 1080, text only.

### 2.1 Composition (founder, 20/10/2026)

1. **Base layer:** a rich royal emerald gradient (`#052e26 → #064e3b → #047857`), a gold glow behind the portrait and
   a soft vignette.
2. **The founder's backdrop (founder, 20/10/2026):** `bg_royal_coronation.jpg` (1080 × 1350), full bleed — the
   traditional Khmer **kbach** frame: deep emerald, the kbach / lotus watermark and four golden ornate corners. Nothing
   is placed on the corner ornaments; the blessing lines stay within 800 px so they clear them. A soft oval of deep emerald behind the text keeps every line legible. **Never draw
   architecture or ornaments as vector shapes:** the founder rejected drawn silhouettes as «crude clipart … unworthy of
   His Majesty the King». Royal architecture, if shown, is photographic only. Without the backdrop, use the plain
   emerald gradient and gold glow.
3. **Nothing above His Majesty (founder, 20/10/2026):** no crest and no logo above the King's head — «the official
   ceremonial portrait of His Majesty on the throne in the golden arch is already complete and majestic on its own».
   The upper area is the open tapestry and its glow.
4. **Royal protocol — the brand at the base (founder, 20/10/2026, the CBC model):** nothing commercial above His
   Majesty. The upper area holds only the portrait; the brand is a modest sign-off at the very
   bottom, centred: [mascot] «អេប លុយឆ្លាត · app.luychlat.com».
5. **Foreground:** the **golden arched frame** holds the **official, high-definition royal portrait** — the one focal
   point. **The vertical order (founder, 20/10/2026):** the arch with the portrait, then the gold title, the royal
   name, the dateline, the blessing, the brand at the base. (The title on top, between the corner ornaments, was tried
   and set aside the same day — `TITLE_POSITION`.)
6. **Text, below the arch:** the title in gold, 52 px; the royal name and title in white, 30 px; the gold date chip;
   the blessing, 28 px, centred; then the footer.

### 2.2 Royal imagery — official only

- Use **only official ceremonial portraits that the founder provides** (`public/images/holidays/`). The README there
  records each file's origin and processing.
  > «We cannot just pull random images from the internet!» — the founder, 20/10/2026
- Each portrait must be **at least 1000 px tall**. His Majesty's portrait is 1108 × 1584, upscaled 4× with Lanczos,
  an unsharp mask, contrast × 1.05 and colour × 1.03. A larger original is always preferred.
- **No portrait, no picture:** when the official file is missing, the poster uses the text design and the preview
  tells the approver (`nationalAssetsFor`, `PORTRAIT_CREDITS = {}`).
- The Coat of Arms (`royal_crest_gold.png`) is **not drawn on a royal portrait poster** (founder, 20/10/2026). Ask the
  founder before using it anywhere.

### 2.3 Royal Palace protocol — reference table (verbatim)

| Element | Official wording | Not |
|---|---|---|
| Coronation title (sub-decree) | ព្រះរាជពិធីគ្រងព្រះបរមរាជសម្បត្តិ | ~~…ព្រះបរម**សិរី**រាជសម្បត្តិ~~ |
| The King, line 1 | ព្រះករុណាព្រះបាទសម្តេចព្រះបរមនាថ នរោត្តម សីហមុនី | ~~ព្រះករុណា ព្រះបាទ…~~ (no space after ព្រះករុណា) |
| The King, line 2 | ព្រះមហាក្សត្រ នៃព្រះរាជាណាចក្រកម្ពុជា | ~~ព្រះមហាក្សត្រនៃ…~~ (one space before នៃ) |
| Dateline | ២៩ តុលា ២០០៤ – ២៩ តុលា ២០២៦ · ខួបលើកទី២២ | ~~… - …~~ (an en dash «–»), ~~ខួបលើកទី ២២~~ (the number joins ទី) |
| Offering the blessing | សូមលំឱនកាយក្រាបបង្គំថ្វាយព្រះសព្ទសាធុការពរជ័យ | ~~ថ្វាយព្រះរាជសព្ទ…~~ |
| The sovereign | សូមព្រះករុណាជាអម្ចាស់ជីវិតតម្កល់លើត្បូង | ~~…ជីវិតលើត្បូង~~ |
| Health | ព្រះរាជសុខភាពដ៏ល្អបរិបូរណ៍ ព្រះកាយពលមាំមួន | ~~ព្រះពលានាម័យ~~ |
| Long life | ព្រះជន្មាយុយឺនយូរជាងរយព្រះវស្សា | — |
| Brand inside a royal text | «អេប លុយឆ្លាត» (in « ») | — |

**On the poster — two spacious lines (founder, 20/10/2026, «too many letters … like an administrative letter»):**

> សូមក្រាបបង្គំថ្វាយព្រះពរ សូមព្រះករុណាជាអម្ចាស់ជីវិតតម្កល់លើត្បូង
> ទ្រង់ប្រកបដោយព្រះរាជសុខភាពល្អបរិបូរណ៍ និងព្រះជន្មាយុយឺនយូរជាងរយព្រះវស្សា។

A day may carry these two lines on the graphic (`posterMessage`, 30–28 px). With the title moved to the top
(founder, 20/10/2026) the Coronation shows the **full palace paragraph** below the arch again; the **caption** always
carries it word for word.

**The Coronation blessing (verbatim, in the caption):**

> ក្នុងឱកាសដ៏មហានក្ខត្តឫក្សនេះ ទូលព្រះបង្គំយើងខ្ញុំជាថ្នាក់ដឹកនាំ និងបុគ្គលិកទាំងអស់នៃ «អេប លុយឆ្លាត»
> សូមលំឱនកាយក្រាបបង្គំថ្វាយព្រះសព្ទសាធុការពរជ័យ សូមព្រះករុណាជាអម្ចាស់ជីវិតតម្កល់លើត្បូង
> ទ្រង់ប្រកបដោយព្រះរាជសុខភាពដ៏ល្អបរិបូរណ៍ ព្រះកាយពលមាំមួន និងព្រះជន្មាយុយឺនយូរជាងរយព្រះវស្សា។

The opening «ទូលព្រះបង្គំយើងខ្ញុំ… ក្រាបបង្គំថ្វាយព្រះសព្ទសាធុការពរជ័យ» (`ROYAL_OPENING`) is shared by the King's
birthday and the Queen Mother's birthday.

### 2.4 Royal typography

- **Never break a royal compound across lines.** `ROYAL_UNBREAKABLE` lists them, including «ព្រះករុណា»,
  «ព្រះមហាក្សត្រ», «ក្រាបបង្គំថ្វាយព្រះសព្ទសាធុការពរជ័យ», «សូមព្រះករុណាជាអម្ចាស់ជីវិតតម្កល់លើត្បូង»,
  «ព្រះរាជសុខភាព», «ព្រះកាយពលមាំមួន», «ព្រះជន្មាយុយឺនយូរ», «ព្រះវស្សា» and «អេប លុយឆ្លាត». The poster kit keeps
  them whole, and a test checks the blessing at four widths.
- No parentheses on a royal poster. Nothing is cut: the render reports `truncated: false`.

### 2.5 Caption and publishing

- The Telegram and Facebook caption repeats the poster's royal wording exactly (`nationalCaptionHtml` /
  `nationalCaptionText`): the title, the name lines, the dateline and the blessing.
- **Approval:** the preview goes to «LCA Approval» 48 hours before, at 08:00. It publishes at **05:00** on the day (founder, 20/10/2026 — first in the feed when people wake) to the
  Telegram channel and the Facebook Page, **only after a super admin's tap**. Every preview asks the approver to check
  the royal wording (រាជស័ព្ទ).
- **A better version:** the waiting card is withdrawn and sent again once (the `repreview` flag, acted on only by the
  build listed in `REPREVIEW_READY`).

### 2.6 Timing and scope — mandatory (founder, 20/10/2026)

**Every holiday — national and royal, Islamic, Chinese and global — publishes strictly at 05:00 Cambodia time, once
pre-approved.** A holiday poster lives one day; at 05:00 it is at the top of the feed when people wake (05:30–06:00).
Previewed in «LCA Approval» 48 hours before at 08:00; the card and its ✅ name the day and the time:
«✅ យល់ព្រម (ផ្សាយថ្ងៃ ២៩ តុលា ម៉ោង ០៥:០០ ព្រឹក)». Not approved by 05:00: HOLD — never published by the timer — and
the urgent founder reminder fires at once.

| Group | Days | Channel |
|---|---|---|
| A — National & royal | 7 Jan, royal birthdays, 24 Sep, 15 Oct, **29 Oct**, **9 Nov**, the Royal Ploughing, the Water Festival | Community + Page |
| B — Islamic | 1 Muharram, Mawlid, Eid al-Fitr «ពិធីបុណ្យរ៉ាយ៉ាស្រាយបួស», the Day of Arafah, Eid al-Adha «ពិធីបុណ្យរ៉ាយ៉ាហាជ» | @LuyChlatIslamic only |
| C — Chinese traditional | Chinese New Year, Qingming «ឆេងម៉េង», «ថ្ងៃសែនក្បាលទឹក», Mid-Autumn «ពិធីសែនព្រះខែ» | Community + Page |
| D — Global & cultural | 1 Jan, 8 Mar, 1 May, Khmer New Year, Visak Bochea, Pchum Ben | Community + Page |

Islamic dates come from the Hijri calendar with the admin's offset and can move with the moon sighting; Qingming
comes from a solar-term table — both are flagged on the card for the approver to confirm. Islamic posters use the
glossary's terms only (lib/islamic/glossary.ts) and name @LuyChlatIslamic in their footer.

### 2.7 The calendar

These follow the same standard: 7 January, the King's birthday (14 May), the Queen Mother's birthday (18 June),
Constitution Day (24 September), the King Father's memorial (15 October), the **Coronation (29 October)**,
**Independence Day (9 November)**, the **Water Festival**, and the royal ploughing. Lunar days come from the official
holiday list, never a guess.

**Open items:** official portraits of the King Father (15 October, 9 November) and the Queen Mother (18 June). Until the
founder provides them, those posters use the text design.

---

## Chapter 3 — Islamic Community posters (@LuyChlatIslamic)

Engines: `src/lib/islamic-channel.ts`, `src/lib/server/islamic-poster.ts`, `src/lib/islamic/glossary.ts`.

- **Terminology:** Cham / Khmer Muslim terms from the glossary only:
  - «អាស្សាឡាមុអាឡៃកុម» (Assalamu Alaikum);
  - «យ៉ាហ្សាស្កាល់ឡាហូ ខាយរ៉ន» (Jazakallahu khairan);
  - «បារ៉ាកាត់» (barakah).
- **Banned greetings:** «ជំរាបសួរ», «ជម្រាបសួរ», «សូមជម្រាបសួរ» and «សូមជំរាបសួរ» (`FORBIDDEN_GREETINGS`, golden
  test).
- **Greetings:** a one-to-one message greets the person by name; public posts greet «បងប្អូន».
- **Two-tier colour hierarchy:** line 1 in **white** carries the religious or hadith principle. Lines 2–3 in
  **golden amber** carry the practical money takeaway (`posterLines: [principle, takeaway]`).
- **Posters are hooks, captions explain:** the title, the Arabic, the du'a and one or two hook lines go on the poster.
  Readings «អានថា», meanings and commentary go in the caption only.
- **Parentheses:** never `(...)` on the graphic canvas (a test guards every poster text).
- **Type:** the title is 66 px; the du'a 54; the title's Arabic 44; the hooks 34–44; the dateline 30, written
  «Gregorian · ត្រូវនឹង Hijri». Use Amiri only for whole Arabic lines.
- **Sources:** every fact cites its source, Surah:Ayah or the hadith with its sunnah.com number. Have the wording
  reviewed with a local Imam.
- **Channel purity (founder, 20/10/2026):** the channel carries the market bulletin (NBC, SAR, gold nisab), halal
  finance lessons and du'as, and official announcements only. No quiz teasers: the quiz lives in the app.
- Never a Buddhist holy-day note in this channel, and never an Islamic post in the general channel (`channelFor`).

---

## Chapter 4 — Buddhist Sil Days & traditional cultural holidays

Engines: `src/lib/server/sil-poster.ts`, `src/lib/server/festival-poster.ts`, `lib/holidays.ts`, and the Chhankitek
lunar calendar.

- **Tone:** serene and reflective. On merit festivals write «សូមអនុមោទនា…», never «រីករាយ» (that is for secular
  celebrations). A festival post is a blessing, not a money lecture.
- **Datelines:** use the computed lunar date, written «🪷 ថ្ងៃសីល (…)» / «ត្រូវនឹង ថ្ងៃ…». The lotus is drawn, not an
  emoji. Check every date against the official holiday list and flag any mismatch.
- **Palette:** brand emerald and Khmer gold only, never blue. Cultural motifs (pagoda spire, lotus, ansom) are drawn
  as gold line art.
- **Channels:** the Sil day poster goes to the community channel and the Page, never @LuyChlatIslamic; the eve stays a
  channel note.

---

## Chapter 5 — Everyday financial education & business quotes

Engines: `src/lib/server/tip-poster.ts` (the v3 standard), the 07:00 morning poster, the Tuesday and Friday money
dilemma, and the lesson posters.

- **Copy:** punchy and relatable, grounded in everyday Cambodian life: the market stall, shop and household money
  mixed, a loan date, a family's savings. One idea per poster.
- **Layout (tip v3):** 1080 × 1080 emerald, a gold tag pill with the Khmer date and the headline. The explanation is
  in white, and the last sentence is a soft-gold takeaway, centred.
- **Wording guards:** the banned phrases fail the build (`tests/golden/content-guards.test.ts`). No italics in Khmer.

---

## Chapter 6 — The pre-flight four-layer checklist (before any preview reaches «LCA Approval»)

Render the poster and **look at it**. Zoom into the portrait and every text block. Check every layer, then
check all four again together.

**Layer 1 — Artwork**
- [ ] Only official or app-drawn imagery; the source is recorded in the README.
- [ ] The portrait is HD (at least 1000 px tall), centred in the arch, with no stray pixels or awkward crop.
- [ ] The portrait is not enlarged beyond what its source can carry: it looks sharp at 100 % (founder, 20/10/2026).
- [ ] Nothing above His Majesty: no crest, no logo; the composition is symmetrical and uncluttered.

**Layer 2 — Background**
- [ ] The emerald gradient and the vignette are smooth, with no hard bands.
- [ ] The backdrop is the founder's (never drawn clipart); nothing sits on its corner ornaments; the text is legible on it.
- [ ] The brand badge and the footer are clean; on a royal poster nothing commercial sits above His Majesty (the brand only at the bottom).

**Layer 3 — Content**
- [ ] Every royal or religious term matches this document's tables verbatim.
- [ ] The dates are verified (official list or computed calendar); the anniversary count is correct.
- [ ] The caption matches the poster word for word.
- [ ] The tone is right: a blessing on merit days, never «រីករាយ» there.

**Layer 4 — Typography**
- [ ] No compound royal or religious word or brand name is split across lines; no orphaned single word.
- [ ] No parentheses, no italics, no «…» cuts; the render reports `truncated: false`.
- [ ] The spacing follows Khmer orthography (ខួបលើកទី២២, the en dash «–», one space before «នៃ»).

**Then:** run `npm test` and `npm run test:golden`, and send the preview to «LCA Approval». Nothing is public without
an approver's tap.

---

## Change log

- **20/10/2026:** first edition. Royal protocol audit (the sub-decree title, honorifics, blessing and dateline); the
  national backdrop (Monument, Throne Hall, flag ribbon); official-only HD royal imagery; Islamic channel purity (no
  quiz teaser).
- **20/10/2026:** the drawn silhouettes are removed («crude clipart»). Royal architecture is photographic only, from
  the founder's backdrop `bg_royal_coronation.jpg`.
- **20/10/2026:** the Coronation backdrop is the founder's traditional Khmer kbach frame; on a framed backdrop the brand
  moves to the top centre and the crest inside the top-right ornament.
- **20/10/2026:** royal posters carry no brand at the top — the brand is a modest sign-off at the bottom (the CBC model).
- **20/10/2026:** the Royal Coat of Arms is the apex at the top centre above the arch (147 px), for full symmetry.
- **20/10/2026:** the backdrop is the founder's borderless kbach tapestry; **no crest and no logo above His Majesty** —
  the portrait in the golden arch stands alone; the brand only at the base.
- **20/10/2026:** the poster breathes — two blessing lines on the graphic, the full palace paragraph in the caption.
- **20/10/2026 (final):** the kbach frame with its four golden corners; no crest; the portrait raised into the freed
  space (arch top ≈ 84 px); the lower half open — the two-line blessing centred between the date chip and the corners.
- **20/10/2026:** the occasion first — the title at the top centre above the portrait; the full palace blessing below the
  arch; the brand at the base.
- **20/10/2026:** the portrait smaller (the arch 390 × 470) so the official photo is magnified at most ~1.4× and stays sharp —
  «the photo feels too big; it spoils the poster's quality». Never enlarge a portrait beyond what its source can carry.
- **20/10/2026:** the title back under the portrait (founder: «try putting it back under the photo»); the portrait
  raised (arch top 140 px).
- **20/10/2026:** the holiday engine covers four groups (national and royal, Islamic, Chinese, global), all at 05:00.
