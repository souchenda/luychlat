// Every migration runs BEFORE the new version is built and switched on (deploy/update.sh): for those minutes the
// running app is the previous one, on the new database. So a migration only ADDS — a table, a column with a default,
// a function, a policy — and never takes away what the running code still uses (founder, 28/10/2026 — «អ្នកប្រើមិនគួរ
// រអាក់រអួលពេលអាប់ដេត»). Removing or renaming is a second release, once no code uses the old name, marked in its file
// with «-- contract: <why it is safe now>». Checked over every file in supabase/migrations (migration-safety.test.ts).

export type MigrationRisk = { rule: string; line: number; text: string }

/** Marks a migration as the deliberate second step (contract) of a removal or rename. */
export const CONTRACT_MARK = /^[ \t]*--[ \t]*contract:[ \t]*\S/im

const RULES: { rule: string; re: RegExp }[] = [
  { rule: "drop table", re: /\bdrop\s+table\b/i },
  { rule: "drop column", re: /\bdrop\s+column\b/i },
  { rule: "rename column", re: /\brename\s+column\b/i },
  { rule: "rename table", re: /\balter\s+table\s+(?:if\s+exists\s+)?[\w."]+\s+rename\s+to\b/i },
  { rule: "change column type", re: /\balter\s+column\s+[\w"]+\s+(?:set\s+data\s+)?type\b/i },
  { rule: "set not null", re: /\balter\s+column\s+[\w"]+\s+set\s+not\s+null\b/i },
]

/** SQL without comments (line «--» and block), so a note about a past drop never counts; the line numbers stay. */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/--[^\n]*/g, "")
}

/** What in this migration could break the version still running while it is applied. Empty = additive, safe. */
export function migrationRisks(sql: string): MigrationRisk[] {
  if (CONTRACT_MARK.test(sql)) return []
  const code = stripComments(sql)
  const lines = code.split("\n")
  const risks: MigrationRisk[] = []
  lines.forEach((text, i) => {
    for (const { rule, re } of RULES) if (re.test(text)) risks.push({ rule, line: i + 1, text: text.trim() })
  })
  // A function dropped and not created again in the same file: the running code's RPC call would fail.
  const created = new Set<string>()
  for (const m of code.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?(\w+)"?\s*\(/gi)) created.add(m[1].toLowerCase())
  lines.forEach((text, i) => {
    const m = /\bdrop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?"?(\w+)"?/i.exec(text)
    if (m && !created.has(m[1].toLowerCase())) risks.push({ rule: "drop function", line: i + 1, text: text.trim() })
  })
  return risks
}
