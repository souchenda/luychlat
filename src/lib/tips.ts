/**
 * Financial literacy ("គន្លឹះហិរញ្ញវត្ថុ"): short daily tips and a small
 * knowledge hub, in Khmer and English. General education, not personal
 * financial advice; Islamic finance items are general information (ask a
 * scholar for rulings). Pure: no app imports, so the server's daily bulletin
 * can use it too.
 */

import { islamicTipOfTheDay, type IslamicTip } from "@/lib/islamic-tips"

export type TipTopic = "saving" | "debt" | "credit" | "business" | "islamic"
type Text = { km: string; en: string }
export type Tip = { id: string; topic: TipTopic; title: Text; body: Text; series?: TipSeries }

/** A run of tips published under its own hashtag (the 12:00 caption adds it — lib/post-footer › SERIES_HASHTAGS). */
export type TipSeries = "smart-spending"

/** The bullet every series point starts with: the caption shows the points, the poster the hook and the last point. */
export const BULLET = "• "

/** A series tip's body: the hook, then each point on its own line (the last point is the takeaway). */
export function bulleted(hook: string, points: string[]): string {
  return [hook, ...points.map((p) => `${BULLET}${p}`)].join("\n")
}

/*
 * Khmer copy standard for tips (founder, 2026-10-07) — every tip here can be
 * posted to @LuyChlatCommunity as the 12:00 daily tip:
 *   - Native, natural Khmer — never a word-for-word English translation
 *     (✗ «ហើយមើលវាកើនឡើង» for "watch it grow" → ✓ «នោះប្រាក់សន្សំនឹងកើនឡើងជាលំដាប់»).
 *   - Warm, encouraging and actionable; 1–2 short sentences. The LAST sentence
 *     is the takeaway (the poster sets it apart in soft gold), so make it the
 *     line people remember.
 *   - Everyday Cambodian examples and words: «ថ្លៃសាលាកូន», «ម៉ូតូថ្មី», «ទឹកភ្លើង»,
 *     «សន្សំតិចៗតែទៀងទាត់», ABA / ACLEDA / KHQR, riel and dollars.
 *   - Facts must be right (rates, rules, Islamic terms checked); no promises of returns.
 */
export const TIPS: Tip[] = [
  // Saving & budgeting — the «Smart Spending» series first (founder, 21/10/2026): a hook, three short points, the last the
  // takeaway (the poster's gold line). It replaced the older one-paragraph versions of the same four rules.
  {
    id: "pay-yourself-first",
    topic: "saving",
    series: "smart-spending",
    title: { km: "ក្បួនសន្សំមុនចាយ", en: "Pay yourself first" },
    body: {
      km: bulleted("ចាំចាយសល់ ទើបសន្សំ? ខែណាក៏មិនដែលសល់ដែរ។", [
        "ថ្ងៃបើកប្រាក់ខែ ផ្ទេរ ១០% ចូលកាបូបសន្សំភ្លាម មុនចាយអ្វីទាំងអស់។",
        "លុយដែលនៅសល់ ទើបជាថវិកាសម្រាប់ចាយប្រចាំខែ។",
        "សន្សំមុន ចាយក្រោយ ប្រាក់សន្សំទើបកើនរាល់ខែ មិនមែនចាំសំណាង។",
      ]),
      en: bulleted("Waiting to save what's left? There's never anything left.", [
        "On payday, move 10% into savings before spending anything.",
        "What remains is your budget for the month.",
        "Save first, spend second: that's how savings grow every month, not by luck.",
      ]),
    },
  },
  {
    id: "rule-48-hours",
    topic: "saving",
    series: "smart-spending",
    title: { km: "ក្បួនទប់ចិត្ត ៤៨ ម៉ោង", en: "The 48-hour rule" },
    body: {
      km: bulleted("ឃើញគេផ្សាយលក់តាមអនឡាញ ចិត្តចង់ចុចទិញភ្លាម?", [
        "កុំទាន់ចុចទិញ — ថតអេក្រង់ទុក ឬដាក់ក្នុងកន្ត្រកសិន។",
        "រង់ចាំ ៤៨ ម៉ោង ហើយសួរខ្លួនឯងថា៖ ចាំបាច់ពិត ឬគ្រាន់តែចង់បាន?",
        "បើនៅតែចាំបាច់ ហើយមានថវិកា ចាំទិញ — ភាគច្រើន ចិត្តចង់បាននោះរលាយបាត់ដោយខ្លួនឯង។",
      ]),
      en: bulleted("Saw it online and want to tap “buy” right now?", [
        "Don't buy yet: screenshot it or leave it in the cart.",
        "Wait 48 hours and ask yourself: do I need it, or just want it?",
        "If you still need it and it fits the budget, buy it; most of the time the urge simply passes.",
      ]),
    },
  },
  {
    id: "track-small-spending",
    topic: "saving",
    series: "smart-spending",
    title: { km: "ក្បួនកាហ្វេ និងចំណាយតូចតាច", en: "The latte factor" },
    body: {
      km: bulleted("កាហ្វេមួយកែវ $២,៥០ មើលទៅតិចតួចណាស់ មែនទេ?", [
        "មួយថ្ងៃមួយកែវ មួយខែអស់ $៧៥។",
        "មួយឆ្នាំអស់ $៩០០ — ប្រហែល ៣,៦ លានរៀល បើគិត ៤ ០០០ ៛ ក្នុងមួយដុល្លារ។",
        "មិនមែនហាមផឹកទេ — គ្រាន់តែកត់ត្រាការចាយតូចៗ ឱ្យដឹងខ្លួនថាលុយទៅណា។",
      ]),
      en: bulleted("A $2.50 coffee looks like nothing, right?", [
        "One a day is $75 a month.",
        "That's $900 a year (about 3.6 million riel at 4,000 ៛ to the dollar).",
        "Nobody says stop: just record the small spending so you know where the money goes.",
      ]),
    },
  },
  {
    id: "rule-50-30-20",
    topic: "saving",
    series: "smart-spending",
    title: { km: "ក្បួនស្រោមសំបុត្រ ៣ ថង់", en: "Three envelopes: 50/30/20" },
    body: {
      km: bulleted("ប្រាក់ខែចូល ចាយលាយគ្នាទាំងអស់ ចុងខែមិនដឹងលុយទៅណា?", [
        "ថង់ទី ១ — ៥០% ចំណាយចាំបាច់៖ ថ្លៃផ្ទះ ម្ហូប និងទឹកភ្លើង។",
        "ថង់ទី ២ — ៣០% ចំណាយតាមចិត្ត៖ ញ៉ាំក្រៅ ទិញអីវ៉ាន់ ដើរលេង។",
        "ថង់ទី ៣ — ២០% ប្រាក់បម្រុងអាសន្ន — ថង់នេះ កុំប៉ះ។",
      ]),
      en: bulleted("Salary in, everything spent from one pile, and by month end nobody knows where it went?", [
        "Envelope 1: 50% for needs (rent, food, water and electricity).",
        "Envelope 2: 30% for wants (eating out, shopping, outings).",
        "Envelope 3: 20% for the emergency fund, and that one stays untouched.",
      ]),
    },
  },
  {
    id: "emergency-fund",
    topic: "saving",
    title: { km: "ប្រាក់បម្រុងសម្រាប់ពេលអាសន្ន", en: "Build an emergency fund" },
    body: {
      km: "គោលដៅ៖ ប្រាក់ស្មើនឹងការចំណាយចាំបាច់ ៣ ទៅ ៦ ខែ ទុកដាច់ដោយឡែក។ ចាប់ផ្ដើមតូចៗ — សូម្បីតែ $១០ ក្នុងមួយសប្ដាហ៍ក៏ជួយបាន។",
      en: "Aim for 3–6 months of essential expenses, kept separate. Start small — even $10 a week adds up.",
    },
  },
  {
    id: "borrow-to-earn",
    topic: "debt",
    series: "smart-spending",
    title: { km: "កុំខ្ចីលុយទិញរបស់ដែលមិនបង្កើតចំណូល", en: "Don't borrow for things that earn nothing" },
    body: {
      km: bulleted("ខ្ចីលុយទិញទូរស័ព្ទថ្មី ឬឡាន ព្រោះគេមានដែរ?", [
        "របស់ប្រើផ្ទាល់ខ្លួន មិនរកលុយចូលវិញទេ — វាបន្ថែមតែការប្រាក់ និងបំណុល។",
        "ខ្ចីពង្រីកអាជីវកម្ម អាចជាបំណុលល្អ លុះត្រាតែចំណូលបន្ថែម លើសប្រាក់ត្រូវបង់ប្រចាំខែ។",
        "មុនខ្ចី សួរខ្លួនឯងថា៖ របស់នេះ រកលុយសងខ្លួនវាវិញបានទេ?",
      ]),
      en: bulleted("Borrowing for a new phone or a car because everyone has one?", [
        "Things for your own use earn nothing back: they only add interest and debt.",
        "Borrowing to grow a business can be good debt, but only when the extra income is more than the monthly instalment.",
        "Before you borrow, ask: will this pay for itself?",
      ]),
    },
  },
  {
    id: "market-list",
    topic: "saving",
    series: "smart-spending",
    title: { km: "ក្បួនដើរផ្សារកុំឱ្យធ្លាយហោប៉ៅ", en: "Shop without leaking money" },
    body: {
      km: bulleted("ចូលផ្សារទៅទិញតែស្ករ ចេញមកវិញដៃពេញថង់?", [
        "សរសេរបញ្ជីមុខទំនិញមុនចេញពីផ្ទះ ហើយទិញតែអ្វីដែលមានក្នុងបញ្ជី។",
        "យកលុយសុទ្ធតាមចំនួនដែលគ្រោងទុក កុំយកលើស។",
        "កុំដើរផ្សារពេលឃ្លានបាយ — ពោះឃ្លាន ធ្វើឱ្យភ្នែកចង់ទិញគ្រប់យ៉ាង។",
      ]),
      en: bulleted("Went to the market for sugar and came back with full bags?", [
        "Write the list before leaving home, and buy only what's on it.",
        "Bring just the cash you planned to spend.",
        "Never shop hungry: an empty stomach wants everything.",
      ]),
    },
  },
  {
    id: "slip-5-seconds",
    topic: "saving",
    series: "smart-spending",
    title: { km: "ក្បួនកត់ត្រាវិក្កយបត្រ ៥ វិនាទី", en: "Record a slip in 5 seconds" },
    body: {
      km: bulleted("ចាយហើយភ្លេចកត់ ចុងខែមិនដឹងលុយទៅណា?", [
        "ចាយរួច ថតរូប Slip ឬវិក្កយបត្រភ្លាម។",
        "ផ្ញើចូល Telegram Bot @luychlat_bot — Bot អានចំនួនទឹកប្រាក់ ហើយកត់ទុកឱ្យ។",
        "បើកអេប លុយឆ្លាត ដឹងភ្លាមថាខែនេះចាយអស់ប៉ុន្មាន។",
      ]),
      en: bulleted("Spent it, forgot to note it, and lost track by month end?", [
        "Right after paying, take a photo of the slip or receipt.",
        "Send it to the Telegram Bot @luychlat_bot: it reads the amount and records it for you.",
        "Open App Luy Chlat and see at once how much this month has cost.",
      ]),
    },
  },
  {
    id: "monthly-review",
    topic: "saving",
    title: { km: "ពិនិត្យថវិកាប្រចាំខែ", en: "Review your month" },
    body: {
      km: "ចុងខែ ចំណាយ ១០ នាទីមើលរបាយការណ៍៖ ប្រភេទណាចាយច្រើនជាងគេ? ខែក្រោយ កំណត់ថវិកាសម្រាប់ប្រភេទនោះ។",
      en: "At month end, spend 10 minutes on your report: which category cost the most? Set a budget for it next month.",
    },
  },
  {
    id: "separate-goals",
    topic: "saving",
    title: { km: "ដាក់ឈ្មោះគោលដៅសន្សំ", en: "Give savings a name" },
    body: {
      km: "សន្សំសម្រាប់ «ថ្លៃសាលាកូន» ឬ «ម៉ូតូថ្មី» ងាយធ្វើតាមជាង «សន្សំទូទៅ»។ កំណត់គោលដៅឱ្យច្បាស់លាស់ នោះប្រាក់សន្សំនឹងកើនឡើងជាលំដាប់។",
      en: "Saving for “school fees” or “a new motorbike” is easier than “general savings”. Create separate goals and watch them grow.",
    },
  },
  {
    id: "riel-and-dollar",
    topic: "saving",
    title: { km: "កុំភ្លេចប្រាក់រៀល", en: "Count your riel too" },
    body: {
      km: "ប្រាក់រៀលតូចៗក្នុងហោប៉ៅ ក៏ជាលុយដែរ។ កត់វាក្នុងកាបូប «សាច់ប្រាក់» រៀល ដើម្បីឱ្យទ្រព្យសរុបត្រឹមត្រូវ។",
      en: "Small riel notes in your pocket are money too. Keep them in a riel cash wallet so your totals stay accurate.",
    },
  },

  // Debt
  {
    id: "debt-list",
    topic: "debt",
    title: { km: "សរសេរបំណុលទាំងអស់", en: "List every debt" },
    body: {
      km: "សរសេរបំណុលទាំងអស់៖ ម្ចាស់បំណុល ចំនួននៅសល់ ការប្រាក់ និងថ្ងៃត្រូវសង។ ដឹងច្បាស់ថាជំពាក់គេប៉ុន្មាន ទើបអាចរៀបចំផែនការសងឱ្យរួចខ្លួនបាន។",
      en: "Write down every debt: who, how much is left, the interest and the due date. Seeing it all is the first step out of debt.",
    },
  },
  {
    id: "avalanche",
    topic: "debt",
    title: { km: "សងការប្រាក់ខ្ពស់មុន", en: "Highest interest first" },
    body: {
      km: "បង់ចំនួនអប្បបរមាគ្រប់បំណុល ហើយដាក់លុយលើសទៅបំណុលដែលការប្រាក់ខ្ពស់ជាងគេ។ វិធីនេះសន្សំការប្រាក់បានច្រើនជាងគេ ហើយរួចបំណុលលឿនជាង។",
      en: "Pay the minimum on every debt and put any extra on the one with the highest interest — this saves the most interest.",
    },
  },
  {
    id: "snowball",
    topic: "debt",
    title: { km: "សងបំណុលតូចជាងគេមុន", en: "Pay the smallest debt first" },
    body: {
      km: "បើត្រូវការកម្លាំងចិត្ត ចូរជ្រើសរើសសងបំណុលតូចជាងគេឱ្យអស់មុន។ ការកាត់បន្ថយបំណុលបានមួយៗ នឹងជួយឱ្យយើងមានកម្លាំងចិត្តបន្តរហូតដល់រួចបំណុល។",
      en: "If you need motivation, clear the smallest debt first. Paying debts off one by one keeps you going until you are debt-free.",
    },
  },
  {
    id: "no-new-debt",
    topic: "debt",
    title: { km: "ឈប់បង្កើតបំណុលថ្មី", en: "Stop adding new debt" },
    body: {
      km: "ពេលកំពុងសងបំណុល កុំខ្ចីថ្មីដើម្បីទិញរបស់ដែលមិនចាំបាច់។ ខ្ចីថ្មីដើម្បីសងចាស់ ជាធម្មតាធ្វើឱ្យកាន់តែធ្ងន់។",
      en: "While paying off debt, don't borrow for things you don't need. Borrowing to repay old debt usually makes it heavier.",
    },
  },
  {
    id: "true-cost",
    topic: "debt",
    title: { km: "ដឹងតម្លៃពិតនៃប្រាក់កម្ចី", en: "Know a loan's true cost" },
    body: {
      km: "ការប្រាក់ ២% ក្នុងមួយខែ = ប្រហែល ២៤% ក្នុងមួយឆ្នាំ។ មុនខ្ចី បើក «គណនាប្រាក់កម្ចី» ក្នុងអេប ដើម្បីដឹងការប្រាក់សរុបដែលត្រូវបង់។",
      en: "2% a month is about 24% a year. Use the loan calculator before borrowing to see the total interest.",
    },
  },
  {
    id: "talk-to-lender",
    topic: "debt",
    title: { km: "និយាយជាមួយម្ចាស់បំណុលឱ្យបានឆាប់", en: "Talk to your lender early" },
    body: {
      km: "បើដឹងថាមិនអាចសងទាន់ពេល សូមទាក់ទងម្ចាស់បំណុល ឬធនាគារមុនថ្ងៃកំណត់។ ការរៀបចំកាលវិភាគថ្មី ល្អជាងការខកខាន។",
      en: "If you can't pay on time, contact the lender or bank before the due date. A new schedule beats a missed payment.",
    },
  },
  {
    id: "lending-family",
    topic: "debt",
    title: { km: "ឱ្យខ្ចីដោយមានកំណត់ត្រា", en: "Lend with a record" },
    body: {
      km: "សូម្បីតែឱ្យសាច់ញាតិខ្ចី ក៏គួរកត់ចំនួន ថ្ងៃ និងថ្ងៃសងដែរ។ វាការពារទំនាក់ទំនងល្អ ហើយងាយរំលឹកដោយសុភាព។",
      en: "Even when lending to family, note the amount, date and repayment date. It protects the relationship and makes polite reminders easy.",
    },
  },

  // Credit cards & credit
  {
    id: "card-pay-full",
    topic: "credit",
    title: { km: "បង់ប័ណ្ណឥណទានឱ្យគ្រប់ចំនួន", en: "Pay your card in full" },
    body: {
      km: "កុំបង់ត្រឹមតែចំនួនអប្បបរមាដែលធនាគារទាមទារ ព្រោះការប្រាក់កើនឡើងរាល់ថ្ងៃ។ បង់ឱ្យគ្រប់ចំនួនជារៀងរាល់ខែ ដើម្បីកុំឱ្យធ្លាក់ក្នុងអន្ទាក់បំណុល។",
      en: "Pay the full card balance before the due date to avoid interest. Paying only the minimum lets interest grow every month.",
    },
  },
  {
    id: "card-utilization",
    topic: "credit",
    title: { km: "ប្រើប័ណ្ណមិនលើស ៣០%", en: "Keep card use under 30%" },
    body: {
      km: "ព្យាយាមប្រើមិនលើស ៣០% នៃកម្រិតឥណទាន។ ការប្រើជិតពេញកម្រិត ជាសញ្ញាហានិភ័យ ហើយអាចប៉ះពាល់ប្រវត្តិឥណទាន។",
      en: "Try to use no more than 30% of your credit limit. Running close to the limit is a risk signal and can hurt your credit history.",
    },
  },
  {
    id: "on-time-history",
    topic: "credit",
    title: { km: "សងទាន់ពេល = ប្រវត្តិល្អ", en: "On time builds your record" },
    body: {
      km: "ធនាគារ និងគ្រឹះស្ថានមីក្រូហិរញ្ញវត្ថុពិនិត្យប្រវត្តិសងប្រាក់។ ការសងទាន់ពេលជាប់លាប់ ជួយឱ្យខ្ចីបានការប្រាក់ទាបនៅពេលក្រោយ។",
      en: "Banks and MFIs check your repayment history. Paying on time, consistently, helps you borrow at lower rates later.",
    },
  },
  {
    id: "card-not-income",
    topic: "credit",
    title: { km: "ប័ណ្ណឥណទានមិនមែនជាប្រាក់ចំណូល", en: "A card is not extra income" },
    body: {
      km: "ប័ណ្ណឥណទានជាលុយខ្ចី មិនមែនលុយបន្ថែមទេ។ ទិញតាមប័ណ្ណតែអ្វីដែលបងមានលុយសងរួចហើយ ដូចចាយលុយក្នុងហោប៉ៅខ្លួនឯង។",
      en: "Only spend on a card what you already have the money to repay. Treat it like a card that draws from your own wallet.",
    },
  },

  // Small business
  {
    id: "separate-money",
    topic: "business",
    title: { km: "បំបែកលុយហាង និងលុយផ្ទះ", en: "Separate shop and home money" },
    body: {
      km: "ប្រើកាបូបដាច់ដោយឡែកសម្រាប់អាជីវកម្ម។ ពេលយកលុយហាងទៅប្រើផ្ទាល់ខ្លួន កត់ជា «ម្ចាស់ដកប្រើ» ដើម្បីដឹងចំណេញពិតរបស់ហាង។",
      en: "Use separate wallets for the business. When you take shop money for yourself, record it as an owner's draw to see the real profit.",
    },
  },
  {
    id: "cash-flow-daily",
    topic: "business",
    title: { km: "មើលលំហូរសាច់ប្រាក់រាល់ថ្ងៃ", en: "Watch cash flow daily" },
    body: {
      km: "ចំណេញក្នុងបញ្ជី មិនមែនមានន័យថាមានលុយក្នុងដៃទេ។ ពិនិត្យលុយចូល លុយចេញ និងភ្ញៀវដែលជំពាក់ រៀងរាល់ថ្ងៃ។",
      en: "Profit on paper isn't cash in hand. Check money in, money out and who owes you, every day.",
    },
  },
  {
    id: "collect-receivables",
    topic: "business",
    title: { km: "ប្រមូលប្រាក់ជំពាក់ឱ្យទាន់ពេល", en: "Collect what you're owed" },
    body: {
      km: "លក់ជំពាក់ច្រើនពេក អាចធ្វើឱ្យហាងខ្វះលុយទិញស្តុក។ កំណត់ថ្ងៃសង ហើយផ្ញើការរំលឹកដោយសុភាពជាមួយ KHQR។",
      en: "Too much credit sales can leave you short for new stock. Set repayment dates and send polite reminders with your KHQR.",
    },
  },
  {
    id: "price-for-profit",
    topic: "business",
    title: { km: "គិតតម្លៃលក់ឱ្យគ្រប់ថ្លៃដើម", en: "Price to cover every cost" },
    body: {
      km: "តម្លៃលក់ត្រូវគ្របដណ្ដប់ថ្លៃទំនិញ ថ្លៃជួល ទឹកភ្លើង ប្រាក់ខែ និងដឹកជញ្ជូន — មិនមែនតែថ្លៃទិញទំនិញនោះទេ។ គណនាថ្លៃដើមពិតម្ដងក្នុងមួយខែ ហើយបន្ថែមប្រាក់ចំណេញលើវា។",
      en: "Your price must cover stock, rent, utilities, wages and delivery — not only what you paid for the goods.",
    },
  },
  {
    id: "business-buffer",
    topic: "business",
    title: { km: "ទុកប្រាក់បម្រុងសម្រាប់ហាង", en: "Keep a business buffer" },
    body: {
      km: "ទុកប្រាក់គ្រប់គ្រាន់សម្រាប់ចំណាយ ១-២ ខែ ដូចជាថ្លៃជួល ប្រាក់ខែ និងទឹកភ្លើង ពេលលក់មិនដាច់ ឬរដូវស្ងាត់។ ដាក់វាក្នុងគណនីដាច់ដោយឡែក កុំយកមកប្រើក្នុងការលក់ប្រចាំថ្ងៃ។",
      en: "Keep enough for 1–2 months of fixed costs (rent, wages, utilities) for slow seasons.",
    },
  },
  {
    id: "reconcile-bank",
    topic: "business",
    title: { km: "ផ្ទៀងផ្ទាត់ជាមួយរបាយការណ៍ធនាគារ", en: "Match your bank statement" },
    body: {
      km: "ម្ដងក្នុងមួយខែ នាំចូលរបាយការណ៍ ABA ឬ ACLEDA ដើម្បីប្រាកដថាគ្មានប្រតិបត្តិការណាមួយបាត់។ សមតុល្យក្នុងអេបដែលត្រូវនឹងធនាគារ ធ្វើឱ្យរបាយការណ៍ និងពន្ធត្រឹមត្រូវ។",
      en: "Once a month, import your ABA or ACLEDA statement to make sure no transaction is missing.",
    },
  },

  // Islamic finance (only when Islamic Mode is on)
  {
    id: "islamic-riba",
    topic: "islamic",
    title: { km: "ជៀសវាងការប្រាក់ ឬ «រីបា»", en: "Avoiding riba (interest)" },
    body: {
      km: "បើមានការប្រាក់ពីគណនីធនាគារ កត់វាដាច់ដោយឡែក ដើម្បីងាយ «សម្អាត» ដោយបរិច្ចាគ។ សួរអ្នកប្រាជ្ញសាសនា សម្រាប់ការវិនិច្ឆ័យជាក់លាក់។",
      en: "If your bank account earns interest, record it separately so it's easy to purify by giving it away. Ask a scholar for specific rulings.",
    },
  },
  {
    id: "islamic-zakat",
    topic: "islamic",
    title: { km: "ហ្សាកាត់ ២,៥%", en: "Zakat at 2.5%" },
    body: {
      km: "ហ្សាកាត់ = ២,៥% នៃទ្រព្យសុទ្ធដែលលើសនីសាប ហើយកាន់កាប់គ្រប់មួយឆ្នាំចន្ទគតិ ដែលហៅថា ហាវល៍។ អេបគណនាពីកាបូប និងមាសរបស់អ្នក។",
      en: "Zakat is 2.5% of net wealth above the Nisab, held for a full lunar year (hawl). The app works it out from your wallets and gold.",
    },
  },
  {
    id: "islamic-qard",
    topic: "islamic",
    title: { km: "កម្ចីល្អគ្មានការប្រាក់ — Qard Hasan", en: "Qard Hasan — a goodwill loan" },
    body: {
      km: "Qard Hasan គឺកម្ចីសប្បុរសធម៌ គ្មានការប្រាក់ ដើម្បីជួយអ្នកដទៃ។ កត់វាក្នុងបំណុល ដើម្បីតាមដានការសងដោយសុភាព។",
      en: "Qard Hasan is an interest-free loan to help someone. Record it under debts to follow repayment kindly.",
    },
  },
  {
    id: "islamic-sadaqah",
    topic: "islamic",
    title: { km: "ធ្វើទាន សាដាកះ ជាប្រចាំ", en: "Regular sadaqah" },
    body: {
      km: "ការផ្ដល់ទានតិចៗ តែជាប្រចាំ ងាយធ្វើជាងម្ដងធំៗ។ បង្កើតប្រភេទ «សាដាកះ» ដើម្បីមើលការផ្ដល់របស់អ្នកពេញមួយឆ្នាំ។",
      en: "Small, regular giving is easier than rare large gifts. Use the Sadaqah category to see your giving over the year.",
    },
  },
  {
    id: "islamic-halal-income",
    topic: "islamic",
    title: { km: "ប្រាក់ចំណូលហាឡាល់", en: "Halal income" },
    body: {
      km: "ពិនិត្យប្រភពប្រាក់ចំណូល និងការវិនិយោគ ឱ្យស្របតាមគោលការណ៍សាសនា។ ពេលមិនច្បាស់ សូមពិគ្រោះជាមួយអ៊ីម៉ាម ឬអ្នកប្រាជ្ញ។",
      en: "Check that your income and investments follow Islamic principles. When unsure, ask an Imam or a scholar.",
    },
  },
]

export const TOPIC_META: Record<TipTopic, { emoji: string; title: Text }> = {
  saving: { emoji: "💰", title: { km: "ការសន្សំ និងថវិកា", en: "Saving & budgeting" } },
  debt: { emoji: "🤝", title: { km: "ការគ្រប់គ្រងបំណុល", en: "Debt management" } },
  credit: { emoji: "💳", title: { km: "ប័ណ្ណឥណទាន និងប្រវត្តិឥណទាន", en: "Credit cards & credit history" } },
  business: { emoji: "🏪", title: { km: "ហិរញ្ញវត្ថុអាជីវកម្ម", en: "Small business cash flow" } },
  islamic: { emoji: "🕌", title: { km: "ហិរញ្ញវត្ថុឥស្លាម", en: "Islamic finance" } },
}

/** Hub order; Islamic only when Islamic Mode is on. */
export const HUB_TOPICS: TipTopic[] = ["saving", "debt", "credit", "business", "islamic"]

export type TipContext = { islamic?: boolean; hasDebts?: boolean; highCardUse?: boolean; business?: boolean }

const dayNumber = (date: Date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)

/**
 * The tip of the day: the same for everyone on a given day, rotating through
 * the pool. Context comes first: high credit-card use → a credit tip; active
 * debts → a debt tip (most days); a business workspace → business tips join in.
 * `offset` gives the next tip ("Another tip").
 */
export function tipOfTheDay(date: Date, ctx: TipContext = {}, offset = 0): Tip | IslamicTip {
  // Islamic Mode: the Islamic financial and life ethics, each with its Quran / Hadith source (founder, 18/10/2026).
  if (ctx.islamic) return islamicTipOfTheDay(dayNumber(date), offset)
  const day = dayNumber(date) + offset
  const allowed = (t: Tip) => t.topic !== "islamic" || ctx.islamic
  const pool = (topic: TipTopic) => TIPS.filter((t) => t.topic === topic)
  if (ctx.highCardUse && day % 2 === 0) {
    const credit = pool("credit")
    return credit[Math.floor(day / 2) % credit.length]
  }
  if (ctx.hasDebts && day % 3 !== 2) {
    const debt = pool("debt")
    return debt[day % debt.length]
  }
  const general = TIPS.filter((t) => allowed(t) && (t.topic !== "business" || ctx.business || day % 4 === 0))
  return general[day % general.length]
}
