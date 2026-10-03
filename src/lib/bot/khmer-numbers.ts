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

function wordAt(text: string, i: number) {
  for (const w of WORDS) if (text.startsWith(w[0], i)) return w
  return null
}

export function khmerWordsToDigits(text: string): string {
  let out = ""
  let i = 0
  while (i < text.length) {
    const first = wordAt(text, i)
    // A number must start with a digit word, or a multiplier only after a digit ("15 ពាន់" stays as is).
    if (!first || first[2] === "mult") {
      out += text[i]
      i += 1
      continue
    }
    let total = 0
    let current = 0
    let j = i
    let lastMult = 1
    while (j < text.length) {
      while (text[j] === " " && wordAt(text, j + 1)) j += 1
      const w = wordAt(text, j)
      if (!w) break
      const [word, value, kind] = w
      if (kind === "unit") {
        current += value
      } else if (value === 100) {
        current = (current || 1) * 100
      } else {
        total += (current || 1) * value
        current = 0
        lastMult = value
      }
      j += word.length
    }
    let value = total + current
    // "បីកន្លះ" = 3.5; "ពីរម៉ឺនកន្លះ" = 25,000 (half of the last multiplier).
    if (text.startsWith(HALF, j)) {
      value += current ? 0.5 : lastMult / 2
      j += HALF.length
    }
    out += ` ${value} `
    i = j
  }
  return out.replace(/ {2,}/g, " ").trim()
}
