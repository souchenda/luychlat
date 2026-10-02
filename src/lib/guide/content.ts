/**
 * User Guide & FAQs (Settings › របៀបប្រើប្រាស់). Bilingual; kept out of the
 * UI dictionaries because it is long-form text. Section ids are used as
 * deep links: /guide#reconcile, /guide#ai …
 */
export type Bilingual = { km: string; en: string }
export type GuideItem = { q: Bilingual; a: Bilingual[] }
export type GuideSection = { id: "start" | "tracking" | "reconcile" | "ai" | "plans"; title: Bilingual; items: GuideItem[] }

export const GUIDE: GuideSection[] = [
  {
    id: "start",
    title: { km: "១. ការចាប់ផ្តើមដំបូង", en: "1. Getting started" },
    items: [
      {
        q: { km: "តើបង្កើតកាបូប ឬគណនីធនាគារដោយរបៀបណា?", en: "How do I add a wallet or bank account?" },
        a: [
          { km: "ចូល «កាបូប» › «បន្ថែមកាបូប»។ ជ្រើសធនាគារ (ABA, ACLEDA, Wing…) ឬ «សាច់ប្រាក់សុទ្ធ» ដាក់ឈ្មោះ និងជ្រើសរូបិយប័ណ្ណ USD ឬ KHR។", en: "Go to Wallets › Add wallet. Pick the bank (ABA, ACLEDA, Wing…) or Cash, give it a name and choose USD or KHR." },
          { km: "«សមតុល្យដើម» គឺលុយដែលអ្នកមាននៅថ្ងៃនេះ — មើលក្នុងកម្មវិធីធនាគារ ឬរាប់សាច់ប្រាក់។", en: "The opening balance is what you have today: check your bank app, or count your cash." },
        ],
      },
      {
        q: { km: "សមតុល្យក្នុងកម្មវិធីខុសពីធនាគារ ធ្វើដូចម្តេច?", en: "My balance in the app doesn't match the bank. What do I do?" },
        a: [
          { km: "បើកកាបូប › «កែតម្រូវ» ហើយបញ្ចូលសមតុល្យពិត។ កម្មវិធីនឹងកត់ «កែតម្រូវសមតុល្យ» មួយសម្រាប់ចំនួនខុសគ្នា ដើម្បីកុំឱ្យប្រវត្តិបាត់។", en: "Open the wallet › Adjust and enter the real balance. The app records one \"balance adjustment\" for the difference, so your history stays intact." },
          { km: "ចង់ដឹងថាខុសត្រង់ណា? ប្រើ «ផ្ទៀងផ្ទាត់ជាមួយរបាយការណ៍ធនាគារ» (PRO) — មើលផ្នែកទី ៣។", en: "Want to know where the difference comes from? Use \"Reconcile with bank statement\" (PRO); see section 3." },
        ],
      },
      {
        q: { km: "ប្រើទាំងដុល្លារ និងរៀលបានទេ?", en: "Can I use both dollars and riel?" },
        a: [
          { km: "បាន។ កាបូបនីមួយៗមានរូបិយប័ណ្ណមួយ។ អត្រាប្តូរប្រាក់ (ឧ. $1 = 4,000៛) កំណត់នៅ «ការកំណត់» › «អត្រាប្តូរប្រាក់» ហើយប្រើសម្រាប់សរុបទ្រព្យ។", en: "Yes. Each wallet has one currency. Set the exchange rate (e.g. $1 = 4,000៛) in Settings › Exchange rate; it's used for your totals." },
        ],
      },
      {
        q: { km: "«ផ្ទាល់ខ្លួន» «អាជីវកម្ម» និង «គ្រួសារ» ខុសគ្នាយ៉ាងណា?", en: "What's the difference between Personal, Business and Family?" },
        a: [
          { km: "វាជាគណនីដាច់ដោយឡែក៖ ផ្ទាល់ខ្លួនសម្រាប់លុយខ្លួនឯង អាជីវកម្មសម្រាប់ហាង ឬរបររកស៊ី និងគ្រួសារសម្រាប់ចែករំលែកជាមួយប្តីប្រពន្ធ ឬក្រុមគ្រួសារ។ ប្តូរនៅផ្នែកខាងលើអេក្រង់។", en: "They're separate books: Personal for your own money, Business for a shop or side business, and Family to share with your partner or household. Switch at the top of the screen." },
          { km: "អញ្ជើញសមាជិកគ្រួសារនៅ «ការកំណត់» › «គ្រួសារ» ដោយលេខកូដ ៦ ខ្ទង់។", en: "Invite family members in Settings › Family with a 6-character code." },
        ],
      },
    ],
  },
  {
    id: "tracking",
    title: { km: "២. ការកត់ត្រាចំណូល-ចំណាយ", en: "2. Daily tracking" },
    items: [
      {
        q: { km: "កត់ចំណូល ឬចំណាយដោយរបៀបណា?", en: "How do I record income or an expense?" },
        a: [
          { km: "នៅទំព័រដើម ចុច «+ ចំណូល» ឬ «− ចំណាយ»។ បញ្ចូលចំនួន ជ្រើសប្រភេទ និងកាបូប ហើយរក្សាទុក។ សមតុល្យកាបូបនឹងកែប្រែដោយស្វ័យប្រវត្តិ។", en: "On Home, tap + Income or − Expense. Enter the amount, pick a category and wallet, and save. The wallet balance updates automatically." },
          { km: "គន្លឹះ៖ កត់ភ្លាមៗពេលចាយ — ងាយជាងចាំកត់ពេលល្ងាច។", en: "Tip: record it right when you spend; it's easier than remembering in the evening." },
        ],
      },
      {
        q: { km: "ភ្ជាប់រូបវិក្កយបត្របានទេ?", en: "Can I attach a receipt?" },
        a: [
          { km: "បាន។ ក្នុងទម្រង់កត់ត្រា ចុចរូបកាមេរ៉ា ដើម្បីថត ឬជ្រើសរូប។ រូបត្រូវបានបង្រួម ហើយរក្សាទុកជាឯកជន — មានតែអ្នក (និងសមាជិកគ្រួសារ) ទេដែលមើលឃើញ។", en: "Yes. In the entry form, tap the camera to take or pick a photo. It's compressed and stored privately; only you (and your family members) can see it." },
        ],
      },
      {
        q: { km: "ផ្ទេរលុយពីកាបូបមួយទៅកាបូបមួយទៀត?", en: "How do I move money between wallets?" },
        a: [
          { km: "«កាបូប» › «ផ្ទេរប្រាក់»។ ជ្រើសកាបូបចេញ និងចូល។ បើរូបិយប័ណ្ណខុសគ្នា (USD → KHR) បញ្ចូលចំនួនដែលទទួលបាន។ ការផ្ទេរមិនរាប់ជាចំណូល ឬចំណាយទេ។", en: "Wallets › Transfer. Pick the from and to wallets. If the currencies differ (USD → KHR), enter the amount received. Transfers don't count as income or expense." },
        ],
      },
      {
        q: { km: "កែ ឬលុបប្រតិបត្តិការ?", en: "How do I edit or delete a transaction?" },
        a: [
          { km: "ចុចលើប្រតិបត្តិការក្នុងបញ្ជី ដើម្បីកែ ឬលុប។ សមតុល្យនឹងគណនាឡើងវិញដោយស្វ័យប្រវត្តិ។ សញ្ញា ✓ មានន័យថាបានផ្ទៀងផ្ទាត់ជាមួយធនាគារ — បើកែចំនួន ✓ នឹងបាត់។", en: "Tap it in the list to edit or delete it; balances are recalculated. A ✓ means it was verified with the bank. Changing the amount removes the ✓." },
        ],
      },
      {
        q: { km: "តាមដានតុងទីន (ក្បាល) យ៉ាងដូចម្តេច?", en: "How do I track a tontine?" },
        a: [
          { km: "«បំណុល» › ផ្ទាំង «តុងទីន» › «បន្ថែមក្បាលតុងទីន»។ បញ្ចូលចំណែកក្នុងមួយវេន ចំនួនវេន និងថ្ងៃវេនទី ១ — កម្មវិធីគណនាថ្ងៃត្រូវបង់ឱ្យ ហើយរំលឹកនៅទំព័រដើម។", en: "Debts › Tontine tab › Add a tontine. Enter the share per round, the number of rounds and the round 1 date; the app works out the due dates and reminds you on Home." },
          { km: "«បង់លុយក្បាលនេះ» កត់ចំណាយ «បង់តុងទីន» ពីកាបូប។ កូនរស់ (មិនទាន់ដេញបាន) ជាធម្មតាបង់តិចជាងចំណែក — បញ្ចូលចំនួនពិត ហើយកម្មវិធីគណនាប្រាក់សន្សំបានពីការដេញ។", en: "\"Pay this round\" records a \"Tontine payment\" expense from your wallet. Live members (not won yet) usually pay less than the share: enter the real amount and the app counts what you saved through bids." },
          { km: "«ដេញបាន» កត់ចំណូល «ដេញតុងទីនបាន» ចូលកាបូប ហើយអ្នកក្លាយជា កូនងាប់ — ត្រូវបង់ពេញរហូតដល់វេនចុងក្រោយ។ ចុចវេនដែលបានបង់ ដើម្បីលុបវិញបើកត់ខុស។", en: "\"Won the bid\" records the pot as \"Tontine pot won\" income and makes you a dead member, who pays the full share until the last round. Tap a paid round to undo a mistake." },
        ],
      },
    ],
  },
  {
    id: "reconcile",
    title: { km: "៣. របៀបផ្ទៀងផ្ទាត់របាយការណ៍ធនាគារ", en: "3. Reconciling with your bank statement" },
    items: [
      {
        q: { km: "មុខងារនេះធ្វើអ្វី?", en: "What does it do?" },
        a: [
          { km: "វាប្រៀបធៀបកាបូបក្នុងកម្មវិធី ជាមួយរបាយការណ៍ពីធនាគារ ហើយបង្ហាញ៖ ប្រតិបត្តិការដែលភ្លេចកត់ កម្រៃធនាគារ ការកត់ស្ទួន និងចំនួនខុសគ្នា។ ជាមុខងារ PRO។", en: "It compares your wallet with the bank's statement and shows forgotten transactions, bank fees, double entries and the remaining difference. It's a PRO feature." },
        ],
      },
      {
        q: { km: "ទាញយករបាយការណ៍ពី ABA ឬ ACLEDA យ៉ាងដូចម្តេច?", en: "How do I get a statement from ABA or ACLEDA?" },
        a: [
          { km: "ក្នុងកម្មវិធីធនាគារ បើកគណនី ហើយរកមើល «Statement» ឬ «Account history/ប្រវត្តិ»។ ជ្រើសរយៈពេល (ឧ. ខែមុន) ហើយទាញយកជា CSV ឬ Excel។ ឈ្មោះម៉ឺនុយអាចខុសគ្នាតាមកំណែកម្មវិធី។", en: "In your bank app, open the account and look for \"Statement\" or \"Account history\". Choose a period (e.g. last month) and download it as CSV or Excel. Menu names can differ between app versions." },
          { km: "បើធនាគារផ្តល់តែ PDF ឥឡូវនេះមិនទាន់គាំទ្រទេ — នឹងមានឆាប់ៗ។", en: "If your bank only offers PDF, that isn't supported yet; it's coming soon." },
        ],
      },
      {
        q: { km: "ជំហានផ្ទៀងផ្ទាត់", en: "Steps" },
        a: [
          { km: "១. បើកកាបូប › «ផ្ទៀងផ្ទាត់ជាមួយរបាយការណ៍ធនាគារ» › ជ្រើសឯកសារ។", en: "1. Open the wallet › Reconcile with bank statement › choose the file." },
          { km: "២. ពិនិត្យជួរឈរ (កាលបរិច្ឆេទ ទឹកប្រាក់ សមតុល្យ…)។ បើឃើញ «សមតុល្យរត់ត្រូវគ្នា ✓» មានន័យថាអានបានត្រឹមត្រូវ។", en: "2. Check the columns (date, amount, balance…). \"Running balance adds up ✓\" means it was read correctly." },
          { km: "៣. ចុច «ប្រៀបធៀប»៖ «ត្រូវគ្នា» = មានទាំងពីរ, «ពិនិត្យ» = ប្រហែលដូចគ្នា (សូមបញ្ជាក់), «ខ្វះក្នុងកម្មវិធី» = ចុច «បន្ថែម», «មានតែក្នុងកម្មវិធី» = អាចកត់ស្ទួន។", en: "3. Tap Compare. Matched = in both; Review = probably the same (please confirm); Missing = tap Add; App only = maybe a double entry." },
          { km: "៤. ចុច «រក្សាទុកការផ្ទៀងផ្ទាត់»។ បើនៅខុសគ្នា អាចបន្ថែមការកែតម្រូវមួយ ដើម្បីឱ្យស្មើធនាគារ។", en: "4. Tap Save reconciliation. If a difference remains, you can add one adjustment so the wallet equals the bank." },
        ],
      },
      {
        q: { km: "ឯកសាររបស់ខ្ញុំមានសុវត្ថិភាពទេ?", en: "Is my statement file safe?" },
        a: [
          { km: "ឯកសារត្រូវបានអាននៅលើទូរស័ព្ទរបស់អ្នកប៉ុណ្ណោះ ហើយមិនត្រូវបានផ្ញើទៅម៉ាស៊ីនមេទេ។ មានតែកាលបរិច្ឆេទ ចំនួន ការពិពណ៌នា និងលេខយោងនៃប្រតិបត្តិការប៉ុណ្ណោះដែលត្រូវរក្សាទុក។", en: "The file is read on your phone and never uploaded. Only each transaction's date, amount, description and reference are saved." },
        ],
      },
      {
        q: { km: "នាំចូលខុស ចង់លុបវិញ?", en: "I imported the wrong file. Can I undo it?" },
        a: [
          { km: "បាន៖ ក្នុងទំព័រផ្ទៀងផ្ទាត់ › «ការនាំចូលមុនៗ» › លុប។ សញ្ញា ✓ នឹងត្រូវដកចេញ ប៉ុន្តែប្រតិបត្តិការដែលបានបន្ថែមនៅដដែល (អាចលុបដោយដៃ)។ ឯកសារដដែលនាំចូលពីរដងមិនបានទេ។", en: "Yes: on the reconcile page › Previous imports › delete. The ✓ marks are removed, but added transactions stay (delete them by hand if needed). The same file can't be imported twice." },
        ],
      },
    ],
  },
  {
    id: "ai",
    title: { km: "៤. ការប្រើប្រាស់ប្រឹក្សា AI", en: "4. Using the AI advisor" },
    items: [
      {
        q: { km: "AI ទីប្រឹក្សាអាចធ្វើអ្វីបាន?", en: "What can the AI advisor do?" },
        a: [
          { km: "វាមើលសង្ខេបចំណូល-ចំណាយ ថវិកា និងបំណុលរបស់អ្នក ហើយផ្តល់យោបល់៖ ចាយលើសត្រង់ណា សន្សំបានប៉ុន្មាន គួរសងបំណុលណាមុន។ វាមិនអាចកត់ ឬកែប្រតិបត្តិការទេ។", en: "It looks at a summary of your income, spending, budgets and debts and gives advice: where you overspend, how much you can save, which debt to pay first. It can't record or change transactions." },
        ],
      },
      {
        q: { km: "Offline, LuyChlat AI និង key ផ្ទាល់ខ្លួន ខុសគ្នាយ៉ាងណា?", en: "Offline, LuyChlat AI or my own key?" },
        a: [
          { km: "Offline (ឥតគិតថ្លៃ)៖ គន្លឹះដែលគណនាលើទូរស័ព្ទ។ LuyChlat AI (PRO)៖ AI ពេញលេញ មិនចាំបាច់ key រហូតដល់ ១០០ សំណួរ/ខែ។ Key ផ្ទាល់ខ្លួន៖ អ្នកអាចដាក់ Claude ឬ OpenAI key របស់អ្នក (រក្សាទុកលើទូរស័ព្ទនេះ)។", en: "Offline (free): tips calculated on your phone. LuyChlat AI (PRO): the full AI with no key needed, up to 100 questions a month. Your own key: paste your Claude or OpenAI key (stored on this device)." },
          { km: "ប្តូរនៅ «ការកំណត់» › «AI»។", en: "Switch in Settings › AI." },
        ],
      },
      {
        q: { km: "ឧទាហរណ៍សំណួរ", en: "Sample questions" },
        a: [
          { km: "• «ខែនេះខ្ញុំចាយលើអ្វីច្រើនជាងគេ?»", en: "• \"What did I spend the most on this month?\"" },
          { km: "• «តើខ្ញុំអាចសន្សំ $100 ក្នុងមួយខែបានទេ?»", en: "• \"Can I save $100 a month?\"" },
          { km: "• «គួរសងបំណុលណាមុន?»", en: "• \"Which debt should I pay off first?\"" },
          { km: "• «ប្រៀបធៀបចំណាយខែនេះ និងខែមុន»", en: "• \"Compare this month's spending with last month\"" },
          { km: "• «ធ្វើដូចម្តេចឱ្យពិន្ទុហិរញ្ញវត្ថុខ្ញុំឡើង?»", en: "• \"How can I raise my financial health score?\"" },
        ],
      },
      {
        q: { km: "ទិន្នន័យខ្ញុំត្រូវបានផ្ញើទៅ AI ទេ?", en: "Is my data sent to the AI?" },
        a: [
          { km: "មានតែតួលេខសង្ខេប (សរុបតាមប្រភេទ ថវិកា បំណុល) ប៉ុណ្ណោះ — គ្មានឈ្មោះ លេខទូរស័ព្ទ ឬចំណាំរបស់អ្នកទេ។ អ្នកអាចមើលទិន្នន័យដែលផ្ញើបាន មុនពេលសួរ។", en: "Only summary numbers (totals by category, budgets, debts): no names, phone numbers or notes. You can view exactly what is sent before asking." },
        ],
      },
    ],
  },
  {
    id: "plans",
    title: { km: "៥. គម្រោង Free vs PRO & ការណែនាំមិត្តភក្តិ", en: "5. Free vs PRO & Refer a Friend" },
    items: [
      {
        q: { km: "Free និង PRO ខុសគ្នាអ្វីខ្លះ?", en: "What's the difference between Free and PRO?" },
        a: [
          { km: "Free៖ កាបូប ២, សមាជិកគ្រួសារ ១, គន្លឹះ AI Offline។", en: "Free: 2 wallets, 1 family member, offline AI tips." },
          { km: "PRO ($2.99/ខែ ឬ $24.99/ឆ្នាំ)៖ កាបូប និងសមាជិកគ្មានកំណត់, LuyChlat AI ១០០ សំណួរ/ខែ, ផ្ទៀងផ្ទាត់ធនាគារ, នាំចេញ Excel/PDF, ពិន្ទុហិរញ្ញវត្ថុ។", en: "PRO ($2.99/month or $24.99/year): unlimited wallets and members, LuyChlat AI with 100 questions a month, bank reconciliation, Excel/PDF export, and the financial health score." },
        ],
      },
      {
        q: { km: "ដំឡើង PRO យ៉ាងដូចម្តេច?", en: "How do I upgrade?" },
        a: [
          { km: "«ការកំណត់» › «គម្រោងរបស់ខ្ញុំ» › «ដំឡើង PRO»។ ជ្រើសប្រចាំខែ ឬប្រចាំឆ្នាំ ផ្ទេរប្រាក់តាមព័ត៌មានដែលបង្ហាញ រួចចុច «ខ្ញុំបានបង់រួច»។ PRO នឹងបើកក្រោយការពិនិត្យ (ជាធម្មតាពីរបីម៉ោង)។", en: "Settings › My plan › Get PRO. Choose monthly or yearly, transfer using the details shown, then tap \"I've paid\". PRO turns on after a check, usually within a few hours." },
          { km: "បើ PRO ផុតកំណត់ ទិន្នន័យទាំងអស់នៅដដែល — គ្រាន់តែមិនអាចបន្ថែមលើសដែនកំណត់ Free ប៉ុណ្ណោះ។", en: "If PRO ends, all your data stays; you just can't add beyond the Free limits." },
        ],
      },
      {
        q: { km: "ការណែនាំមិត្តភក្តិ ដំណើរការយ៉ាងណា?", en: "How does Refer a Friend work?" },
        a: [
          { km: "«ការកំណត់» › «ណែនាំមិត្តភក្តិ» › ចែករំលែកលេខកូដ ឬតំណរបស់អ្នក។ ពេលមិត្តចុះឈ្មោះ ហើយប្រើលេខកូដក្នុង ៧ ថ្ងៃដំបូង អ្នកទាំងពីរទទួលបាន PRO ៧ ថ្ងៃ (បន្ថែមលើ PRO ដែលមានស្រាប់)។", en: "Settings › Refer a Friend › share your code or link. When a friend signs up and uses it within their first 7 days, you both get 7 days of PRO, added on top of any PRO you already have." },
          { km: "គណនីនីមួយៗប្រើលេខកូដបានតែម្តង ហើយប្រើលេខកូដខ្លួនឯងមិនបានទេ។", en: "Each account can use one code once, and you can't use your own." },
        ],
      },
    ],
  },
]
