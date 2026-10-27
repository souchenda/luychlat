// The Control Center's verdicts (founder, 28/10/2026): the server agent's report (deploy/ops-agent.py →
// public.ops_status) read into green / amber / red lines, so the founder sees at a glance what needs him. Pure
// (ops-status.test.ts); the page is src/app/(app)/admin/super/control.

export type Level = "ok" | "warn" | "bad"

export type OpsReport = {
  at: number
  website: { code: number; ours: boolean; tampered: boolean; published_at: number | null; watched: boolean }
  app: { code: number; build: string | null; last_deploy: string | null }
  certs: Record<string, number>
  domains: Record<string, { expires: string; days: number }>
  backup: { last_ok: number | null; last: string | null }
  security: { ssh_password_login: boolean; firewall: boolean; banned_now: number | null; banned_total: number | null; auto_updates: boolean }
  disk: { free_gb: number; used_pct: number }
}

export type OpsAction = "website_republish" | "website_rollback" | "backup_now"
export const OPS_ACTIONS: OpsAction[] = ["website_republish", "website_rollback", "backup_now"]

/** The agent reports every 5 minutes; older than 15 means the agent (or its cron) has stopped. */
export const STALE_SECONDS = 15 * 60

export type Verdict = { key: "agent" | "website" | "app" | "certs" | "domains" | "backup" | "security" | "disk"; level: Level }

export function verdicts(r: OpsReport | null, nowSec: number): Verdict[] {
  if (!r) return [{ key: "agent", level: "bad" }]
  const minCert = Math.min(...Object.values(r.certs ?? {}), Infinity)
  const minDomain = Math.min(...Object.values(r.domains ?? {}).map((d) => d.days), Infinity)
  const backupAge = r.backup.last_ok ? nowSec - r.backup.last_ok : Infinity
  const sec = r.security
  return [
    { key: "agent", level: nowSec - r.at > STALE_SECONDS ? "bad" : "ok" },
    { key: "website", level: r.website.code !== 200 || !r.website.ours || r.website.tampered ? "bad" : r.website.watched ? "ok" : "warn" },
    { key: "app", level: r.app.code === 200 ? "ok" : "bad" },
    { key: "certs", level: minCert < 7 ? "bad" : minCert < 14 ? "warn" : "ok" },
    { key: "domains", level: minDomain < 14 ? "bad" : minDomain < 60 ? "warn" : "ok" },
    { key: "backup", level: backupAge > 26 * 3600 ? (r.backup.last_ok ? "bad" : "warn") : "ok" },
    { key: "security", level: sec.ssh_password_login || !sec.firewall ? "bad" : sec.auto_updates ? "ok" : "warn" },
    { key: "disk", level: r.disk.used_pct >= 90 ? "bad" : r.disk.used_pct >= 80 ? "warn" : "ok" },
  ]
}

/** The page's headline: the worst line wins. */
export const overall = (v: Verdict[]): Level => (v.some((x) => x.level === "bad") ? "bad" : v.some((x) => x.level === "warn") ? "warn" : "ok")
