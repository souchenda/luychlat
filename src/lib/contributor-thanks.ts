import * as G from "@/lib/islamic/glossary"

/**
 * Thanks to a member who contributes a place or a qasidah (founder, 19/10/2026): with Islamic blessings for someone
 * in Islamic Mode, warm formal Khmer for everyone else — never Arabic phrases to a member who did not choose Islamic
 * Mode. Shown as the toast on sending, and as the bell notice / Telegram note once approved. Pure
 * (contributor-thanks.test.ts).
 */
export type Contribution = "place" | "qasidah"

const WHAT: Record<Contribution, string> = { place: "ទីតាំង", qasidah: "បទកសាដះ" }

/** The toast when the suggestion is sent. */
export function submittedThanks(islamic: boolean): string {
  return islamic
    ? `${G.ALHAMDULILLAH}! សំណើរបស់អ្នកត្រូវបានបញ្ជូនរួចរាល់ហើយ។ ${G.JAZAKALLAH_LABEL} — សូមអល់ឡោះតបស្នងនូវសេចក្ដីល្អសម្រាប់ការចូលរួមចំណែកកសាងសហគមន៍។`
    : "អរគុណច្រើនសម្រាប់ការចូលរួមចំណែក! សំណើរបស់អ្នកត្រូវបានបញ្ជូនរួចរាល់ហើយ ក្រុមការងារនឹងពិនិត្យផ្ទៀងផ្ទាត់យ៉ាងឆាប់រហ័សបំផុត។"
}

/** The note once a super admin approves it. */
export function approvedThanks(islamic: boolean, what: Contribution): { title: string; message: string } {
  return islamic
    ? {
        title: `🎉 ${G.ALHAMDULILLAH}! បានអនុម័តជាផ្លូវការ`,
        message: `🎉 ${G.ALHAMDULILLAH}! ${WHAT[what]}ដែលអ្នកបានផ្ដល់ជូន ត្រូវបានអនុម័តជាផ្លូវការហើយ។ ${G.BARAKALLAH_LABEL} — សូមអល់ឡោះប្រទានពរជ័យ និងផលបុណ្យដ៏ច្រើនលើសលប់ដល់អ្នក!`,
      }
    : {
        title: "🎉 អបអរសាទរ! បានអនុម័តហើយ",
        message: `🎉 អបអរសាទរ! ${WHAT[what]}ដែលអ្នកបានផ្ដល់ជូន ត្រូវបានអនុម័ត និងដាក់ឱ្យប្រើប្រាស់ជាសាធារណៈហើយ។ ក្រុមការងារ អេប លុយឆ្លាត សូមថ្លែងអំណរគុណយ៉ាងជ្រាលជ្រៅចំពោះការចូលរួមចំណែកដ៏មានតម្លៃរបស់អ្នក!`,
      }
}

/** The member's community on the approval room's cards. */
export const communityBadge = (islamic: boolean) => (islamic ? "[ 🌙 ឥស្លាម ]" : "[ ☀️ មហាជន ]")

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * The founder's private thank-you from @luychlat_bot once a place is approved (19/10/2026), naming the place — HTML
 * for Telegram (`html`) and plain for the bell notice (`plain`). Islamic blessings only in Islamic Mode.
 */
export function placeThanks(islamic: boolean, placeName: string): { title: string; html: string; plain: string } {
  const name = placeName.trim() || "—"
  const build = (b: (s: string) => string) =>
    islamic
      ? `🕌 ${b("សារពី អេប លុយឆ្លាត")}\n\n« ${G.JAZAKALLAH} (Jazakallahu Khayran) បងប្អូន! ទីតាំង ${b(name)} ដែលបងប្អូនបានចូលរួមចែករំលែក ត្រូវបានក្រុមការងារពិនិត្យ និងអនុម័តដាក់បញ្ចូលក្នុងអេបជាផ្លូវការហើយ។\n\nសូមអល់ឡោះ ﷻ ប្រទានពរជ័យ សេចក្តីសុខ និង${G.BARAKAH}ដល់ការលះបង់ និងការចូលរួមរបស់បងប្អូន! 🤲✨ »\n\n— ក្រុមការងារ អេប លុយឆ្លាត`
      : `✨ ${b("សារពី អេប លុយឆ្លាត")}\n\n« អរគុណច្រើនសម្រាប់ការចូលរួមចំណែក! ទីតាំង ${b(name)} ដែលលោកអ្នកបានស្នើសុំ ត្រូវបានក្រុមការងារពិនិត្យ និងអនុម័តដាក់បញ្ចូលក្នុងអេបជាផ្លូវការហើយ ដើម្បីជាប្រយោជន៍ដល់អ្នកប្រើប្រាស់រួមគ្នា។ 🙏❤️ »\n\n— ក្រុមការងារ អេប លុយឆ្លាត`
  return {
    title: islamic ? `🕌 ${G.JAZAKALLAH} — ទីតាំងរបស់អ្នកត្រូវបានអនុម័ត` : "✨ ទីតាំងរបស់អ្នកត្រូវបានអនុម័ត",
    html: build((s) => `<b>${esc(s)}</b>`),
    plain: build((s) => s),
  }
}

export type ThanksStatus = "sent" | "no_telegram" | "failed" | "no_submitter"

/** «💌 ស្ថានភាពសារអរគុណ៖ …» on the approval card. */
export const THANKS_STATUS_LABEL: Record<ThanksStatus, string> = {
  sent: "✅ បានផ្ញើទៅអ្នកស្នើសុំតាម Telegram",
  no_telegram: "🔔 អ្នកស្នើសុំមិនទាន់ភ្ជាប់ Telegram — បានដាក់ក្នុងការជូនដំណឹងក្នុងអេប",
  failed: "⚠️ ផ្ញើតាម Telegram មិនបាន (ប្រហែលបានបិទបូត) — បានដាក់ក្នុងការជូនដំណឹងក្នុងអេប",
  no_submitter: "— (គ្មានអ្នកស្នើសុំ)",
}

/** The toast on the approver's phone. */
export const thanksToast = (s: ThanksStatus) =>
  s === "sent" ? "✅ បានអនុម័ត និងផ្ញើសារអរគុណរួចរាល់!" : s === "no_submitter" ? "✅ បានអនុម័ត" : "✅ បានអនុម័ត — សារអរគុណនៅក្នុងការជូនដំណឹងក្នុងអេប"

/** The approval card once decided: who decided, the thank-you's status, then the original card. HTML. */
export function decidedCard(o: { approved: boolean; by: string; thanks: ThanksStatus | null; original: string; footer: string }): string {
  return [
    o.approved ? "✅ <b>បានអនុម័តរួចរាល់</b>" : "❌ <b>បានបដិសេធ</b>",
    `👤 ដោយ៖ ${esc(o.by)}`,
    ...(o.approved && o.thanks ? [`💌 ស្ថានភាពសារអរគុណ៖ ${THANKS_STATUS_LABEL[o.thanks]}`] : []),
    "",
    esc(o.original.trim()),
    "",
    esc(o.footer),
  ].join("\n")
}
