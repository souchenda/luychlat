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
| **1. Artwork** | Official, high-resolution imagery, or art drawn by the app itself (silhouettes, lotus, line art). Every image is sharp at 1080 px, cleanly cropped, centred, with no stray pixels. | Web photos, candid snapshots, screenshots, watermarked or unlicensed images, AI-generated likenesses of real people. |
| **2. Background** | Depth with dignity: the brand's deep emerald gradient, a soft vignette, and subtle cultural or national layers at 15–20 % opacity. | A flat wall, loud patterns, layers that compete with the text, hard-edged bands. |
| **3. Content** | Correct, verified and respectful: royal protocol, religious terminology, real dates, everyday Cambodian life. Every word earns its place. | Guessed dates, invented honorifics, «AI slop», filler, money lectures on a merit day. |
| **4. Typography** | Clean Khmer type (MiSans Khmer, Kantumruy Pro fallback; Amiri only for whole Arabic lines), a clear hierarchy, centred and balanced lines. No compound word is ever split across lines. | Italic Khmer, parentheses on a graphic, «…» cuts, orphaned words, «&» in Khmer copy (use «និង»). |

**Shared brand frame:** every poster carries «អេប លុយឆ្លាត» with the mascot (top left) and the footer
«អេប លុយឆ្លាត · app.luychlat.com», or the shared frame of `src/lib/server/poster-kit.ts`. Write the brand as
«អេប លុយឆ្លាត» / «App Luy Chlat», never «កម្មវិធី», «អែប» or a bare «LuyChlat».

---

## Chapter 2 — Royal & National Ceremonies

Engines: `src/lib/calendar/cambodia-holidays.ts` holds the days and the wording; `src/lib/server/national-day-poster.ts`
renders the poster. With a portrait the poster is 1080 × 1350; without one it is 1080 × 1080, text only.

### 2.1 Composition (founder, 20/10/2026)

1. **Base layer:** a rich royal emerald gradient (`#052e26 → #064e3b → #047857`), a gold glow behind the portrait and
   a soft vignette.
2. **Architectural heritage layer, at 18 %:** the **Independence Monument «វិមានឯករាជ្យ» on the left** and the
   **Throne Hall «ព្រះទីនាំងទេវាវិនិច្ឆ័យ» of the Royal Palace on the right**. Both are gold silhouettes drawn by the
   app (`independenceMonument`, `throneHall`), never a photograph. Their bases sit on the line of the arch's base,
   with a soft horizon under them.
3. **National accent, at 20 %:** a gentle ribbon of the national flag, **blue · red · blue (1 : 2 : 1, `#032ea1` /
   `#e00025`)**. It rises from left to right behind the arch, above the title and never under the text, and fades into
   the emerald at both ends.
4. **Foreground:** the **golden arched frame** holds the **official, high-definition royal portrait**. The **official
   golden Royal Coat of Arms** sits at the **top right**, with a soft shadow.
5. **Text, below the arch:** the title in gold, 52 px; the royal name and title in white, 30 px; the gold date chip;
   the blessing, 28 px, centred; then the footer.

### 2.2 Royal imagery — official only

- Use **only official ceremonial portraits that the founder provides** (`public/images/holidays/`). The README there
  records each file's origin and processing.
  > «We cannot just pull random images from the internet!» — the founder, 20/10/2026
- Each portrait must be **at least 1000 px tall**. His Majesty's portrait is 1108 × 1584, upscaled 4× with Lanczos,
  an unsharp mask, contrast × 1.05 and colour × 1.03. A larger original is always preferred.
- **No portrait, no picture:** when the official file is missing, the poster uses the text design and the preview
  tells the approver (`nationalAssetsFor`, `PORTRAIT_CREDITS = {}`).
- The Coat of Arms is `royal_crest_gold.png`, transparent and crisp. Ask the founder before changing it.

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

**The Coronation blessing (verbatim):**

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
- **Approval:** the preview goes to «LCA Approval» 48 hours before, at 08:00. It publishes at 07:00 on the day to the
  Telegram channel and the Facebook Page, **only after a super admin's tap**. Every preview asks the approver to check
  the royal wording (រាជស័ព្ទ).
- **A better version:** the waiting card is withdrawn and sent again once (the `repreview` flag, acted on only by the
  build listed in `REPREVIEW_READY`).

### 2.6 The calendar

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

Render the poster and **look at it**. Zoom into the portrait, the crest and every text block. Check every layer, then
check all four again together.

**Layer 1 — Artwork**
- [ ] Only official or app-drawn imagery; the source is recorded in the README.
- [ ] The portrait is HD (at least 1000 px tall), centred in the arch, with no stray pixels or awkward crop.
- [ ] The crest is crisp, golden and transparent at the top right.

**Layer 2 — Background**
- [ ] The emerald gradient and the vignette are smooth, with no hard bands.
- [ ] The heritage silhouettes are at 15–20 %; the flag ribbon is behind the arch and never under the text.
- [ ] The brand badge and the footer are clean.

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
