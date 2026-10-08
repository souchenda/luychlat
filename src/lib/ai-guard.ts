/**
 * Layer 1 of the AI guardrails: before a question goes to the paid model (Gemini),
 * a local check turns away what is clearly not about money — stories, poems, songs,
 * love letters, homework, code, translation, politics, religion, chitchat — with a
 * fixed reply, at no API cost and without using the user's AI quota. Pure; anything
 * that mentions money, a wallet, a bill, a price… always goes through.
 */

export const OFF_TOPIC_REPLY =
  "ខ្ញុំគឺជាជំនួយការហិរញ្ញវត្ថុ លុយឆ្លាត។ ខ្ញុំមានតួនាទីជួយបងកត់ត្រាចំណូល-ចំណាយ តាមដានបេឡា និងវិក្កយបត្រប៉ុណ្ណោះ។ សូមសួរសំណួរដែលទាក់ទងនឹងការគ្រប់គ្រងលុយកាក់!"

/** Money words: if any is present the question is on-topic, whatever else it says. */
const MONEY =
  /លុយ|ប្រាក់|ចំណូល|ចំណាយ|សន្សំ|កាបូប|ធនាគារ|វិក្កយបត្រ|ថ្លៃ|តម្លៃ|បំណុល|កម្ចី|ការប្រាក់|ពន្ធ|ប្រាក់ខែ|អាជីវកម្ម|លក់|ទិញ|ចំណេញ|ខាត|ថវិកា|បេឡា|តុងទីន|មាស|អត្រា|ប្តូរប្រាក់|ប្ដូរប្រាក់|ហាង|ស្តុក|វិនិយោគ|ភាគហ៊ុន|គ្រីបតូ|ធានារ៉ាប់រង|ប\.ស\.ស|ប្រេង|៛|\$|\b(?:money|cash|income|expenses?|spend(?:ing)?|sav(?:e|ing|ings)|budget|wallets?|banks?|bills?|invoices?|debts?|loans?|interest|tax(?:es)?|salary|business|sales?|profit|loss|price|cost|gold|rate|exchange|invest(?:ment|ing)?|stocks?|crypto|insurance|nssf|khqr|aba|acleda|wing|fuel|riel|usd|dollars?|finance|financial|accounting|cash ?flow|net ?worth)\b/i

/** Clearly another kind of request. */
const OFF_TOPIC =
  /រឿងនិទាន|និទានរឿង|កំណាព្យ|ចម្រៀង|បទចម្រៀង|សំបុត្រស្នេហា|ស្នេហា|កិច្ចការផ្ទះ|លំហាត់|ប្រឡង|សរសេរកូដ|កម្មវិធីកុំព្យូទ័រ|បកប្រែ|នយោបាយ|បោះឆ្នោត|គណបក្ស|សាសនា|ព្រះគម្ពីរ|កំប្លែង|រឿងកំប្លែង|ហ្គេម|កីឡា|បាល់ទាត់|រូបមន្តធ្វើម្ហូប|\b(?:story|stories|poem|poetry|song|lyrics|love letter|homework|essay|exam|assignment|code|coding|program(?:ming)?|python|javascript|html|sql|translate|translation|politic(?:s|al)?|election|religion|bible|joke|riddle|game|football|soccer|recipe|movie|celebrity|horoscope|write me|tell me a)\b/i

/** Small talk on its own ("hi", "how are you", "ញ៉ាំបាយនៅ?") — no money question in it. */
const CHITCHAT = /^(?:hi|hello|hey|yo|thanks?|thank you|ok|okay|good (?:morning|night)|how are you|who are you|សួស្តី|ជំរាបសួរ|អរគុណ|សុខសប្បាយទេ|ញ៉ាំបាយនៅ|ធ្វើអីហ្នឹង|អ្នកជានរណា)[\s!?.។]*$/i

/** True when the question should get the fixed reply instead of the model. */
export function isOffTopic(question: string): boolean {
  const q = question.trim()
  if (!q) return false
  if (MONEY.test(q)) return false
  return OFF_TOPIC.test(q) || CHITCHAT.test(q)
}
