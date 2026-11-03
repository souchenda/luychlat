/**
 * Spoken Khmer numbers → digits, for voice notes: speech-to-text writes
 * "ពីរដុល្លារ" or "ដប់ប្រាំពាន់រៀល" rather than "2$" / "15000៛". Only used on
 * transcripts (typed messages keep the user's own digits). Pure.
 *
 *   ម្ភៃប្រាំ → 25 · មួយរយហាសិប → 150 · ពីរម៉ឺនប្រាំពាន់ → 25000 · បីកន្លះ → 3.5
 */

// Longest words first, so ប្រាំមួយ (6) wins over ប្រាំ (5) + មួយ (1).
const WORDS: [string, number, "unit" | "mult"][] = (
  [
    ["សូន្យ", 0, "unit"],
    ["មួយ", 1, "unit"],
    ["ពីរ", 2, "unit"],
    ["បី", 3, "unit"],
    ["បួន", 4, "unit"],
    ["ប្រាំមួយ", 6, "unit"],
    ["ប្រាំពីរ", 7, "unit"],
    ["ប្រាំបី", 8, "unit"],
    ["ប្រាំបួន", 9, "unit"],
    ["ប្រាំ", 5, "unit"],
    ["ដប់", 10, "unit"],
    ["ម្ភៃ", 20, "unit"],
    ["សាមសិប", 30, "unit"],
    ["សែសិប", 40, "unit"],
    ["ហាសិប", 50, "unit"],
    ["ហុកសិប", 60, "unit"],
    ["ចិតសិប", 70, "unit"],
    ["ប៉ែតសិប", 80, "unit"],
    ["កៅសិប", 90, "unit"],
    ["រយ", 100, "mult"],
    ["ពាន់", 1000, "mult"],
    ["ម៉ឺន", 10_000, "mult"],
    ["សែន", 100_000, "mult"],
    ["លាន", 1_000_000, "mult"],
  ] as [string, number, "unit" | "mult"][]
).sort((a, b) => b[0].length - a[0].length)

const HALF = "កន្លះ"

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩"

/** A word, or a whole number in digits («១ម៉ឺន៥ពាន់» — speech-to-text mixes them), at i. */
function wordAt(text: string, i: number): [string, number, "unit" | "mult"] | null {
  for (const w of WORDS) if (text.startsWith(w[0], i)) return w
  // A whole number only — «25,000» / «2.5» stay for the parser as written.
  const d = /^\d+(?![\d,.])/.exec(text.slice(i))
  return d ? [d[0], Number(d[0]), "unit"] : null
}

/**
 * The spoken shorthand (founder, 3/11/2026 — the app's 🎤 heard «បីពាន់ប្រាំ» as 3,005): a lone digit after ពាន់ / ម៉ឺន /
 * សែន / លាន is the next place down — «បីពាន់ប្រាំ» 3,500, «ពីរម៉ឺនប្រាំ» 25,000, «៣ពាន់៥» 3,500, as said at every market.
 */
const shorthand = (lastMult: number, tail: number, tailWords: number) => lastMult >= 1000 && tailWords === 1 && tail >= 1 && tail <= 9

export function khmerWordsToDigits(text: string): string {
  // Khmer digits as 0-9 first, so «១ម៉ឺន៥ពាន់» reads as one number (a transcript only — typed text keeps its own).
  text = text.replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)))
  let out = ""
  let i = 0
  while (i < text.length) {
    const first = wordAt(text, i)
    // A number must start with a digit word, or a multiplier only after a digit.
    if (!first || first[2] === "mult") {
      out += text[i]
      i += 1
      continue
    }
    let total = 0
    let current = 0
    let j = i
    let lastMult = 1
    let parts = 0
    let tailWords = 0
    while (j < text.length) {
      while (text[j] === " " && wordAt(text, j + 1)) j += 1
      const w = wordAt(text, j)
      if (!w) break
      const [word, value, kind] = w
      // Two numbers in digits side by side are two numbers («2 3»), never one.
      if (/^\d/.test(word) && parts > 0 && /^\d/.test(text.slice(i, j).trim().slice(-1))) break
      if (kind === "unit") {
        current += value
        tailWords += 1
      } else if (value === 100) {
        current = (current || 1) * 100
        tailWords = 2
      } else {
        total += (current || 1) * value
        current = 0
        tailWords = 0
        lastMult = value
      }
      parts += 1
      j += word.length
    }
    // Digits with one multiplier («15 ពាន់», «2 ម៉ឺន») stay as written: the parser reads them, ពាន់ / ម៉ឺន meaning riel.
    if (/^\d/.test(first[0]) && parts <= 2 && current === 0) {
      out += text.slice(i, j)
      i = j
      continue
    }
    if (shorthand(lastMult, current, tailWords)) current *= lastMult / 10
    let value = total + current
    // "បីកន្លះ" = 3.5; "ពីរម៉ឺនកន្លះ" = 25,000 (half of the last multiplier).
    if (text.startsWith(HALF, j)) {
      value += current ? 0.5 : lastMult / 2
      j += HALF.length
    }
    out += /^\d/.test(first[0]) && parts === 1 ? text.slice(i, j) : ` ${value} `
    i = j
  }
  return out.replace(/ {2,}/g, " ").trim()
}
