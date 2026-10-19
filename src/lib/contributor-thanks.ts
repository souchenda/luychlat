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
