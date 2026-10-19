/**
 * Co-approvers in «LCA Approval» (founder, 19/10/2026): the commands and the bot's replies. Pure (co-approvers.test.ts);
 * the database decides who may tap (public.tip_chat_approver).
 */
export const isApproverCommand = (text: string) => /^\/(add|remove)approver(@\w+)?(\s|$)/i.test(text.trim())

/** «/addapprover sister@gmail.com» → add with that login; «/removeapprover» → remove. */
export function parseApproverCommand(text: string): { action: "add" | "remove"; login: string | null } | null {
  const m = /^\/(add|remove)approver(?:@\w+)?(?:\s+(.+))?$/i.exec(text.trim())
  if (!m) return null
  const action = m[1].toLowerCase() as "add" | "remove"
  return { action, login: action === "add" ? m[2]?.trim() || null : null }
}

export type ApproverReply =
  | { kind: "added"; name: string; linked: boolean }
  | { kind: "removed"; name: string }
  | { kind: "not_approver"; name: string }
  | { kind: "no_account"; login: string }
  | { kind: "reply_needed" }
  | { kind: "forbidden" }
  | { kind: "failed" }

export function approverReply(r: ApproverReply): string {
  switch (r.kind) {
    case "added":
      return r.linked
        ? `✅ ${r.name} អាចចុច [ ✅ ] [ 🚀 ] [ ❌ ] ក្នុងក្រុមនេះបានហើយ។ ការសម្រេចនីមួយៗ ត្រូវបានកត់ត្រាតាមឈ្មោះ។`
        : `✅ បានកត់ត្រា ${r.name} ជាអ្នកអនុម័ត — ប៉ុន្តែមិនទាន់ភ្ជាប់គណនី អេប លុយឆ្លាត ទេ។ សូមឆ្លើយតបសាររបស់គាត់ម្ដងទៀត៖ /addapprover <អ៊ីមែល ឬលេខទូរស័ព្ទចូលគណនី>`
    case "removed":
      return `🔒 ${r.name} មិនអាចអនុម័តទៀតទេ។`
    case "not_approver":
      return `${r.name} មិនមែនជាអ្នកអនុម័តទេ។`
    case "no_account":
      return `⚠️ រកមិនឃើញគណនី «${r.login}» ទេ។ សូមពិនិត្យអ៊ីមែល ឬលេខទូរស័ព្ទដែលគាត់ប្រើចូល អេប លុយឆ្លាត។`
    case "reply_needed":
      return "សូមឆ្លើយតប (Reply) សាររបស់អ្នកដែលត្រូវបន្ថែម ដោយសរសេរ /addapprover <អ៊ីមែល ឬលេខទូរស័ព្ទ>។"
    case "forbidden":
      return "🔒 សម្រាប់ Super Admin ប៉ុណ្ណោះ។"
    case "failed":
      return "⚠️ មិនអាចរក្សាទុកបានទេ។ សូមសាកម្ដងទៀត។"
  }
}

/** TELEGRAM_APPROVER_IDS: «123456789, 987654321» → the valid Telegram user ids (anything else is ignored). */
export function parseApproverIds(env: string | undefined): number[] {
  return [...new Set((env ?? "").split(/[\s,;]+/).filter((s) => /^\d{5,15}$/.test(s)).map(Number))]
}
