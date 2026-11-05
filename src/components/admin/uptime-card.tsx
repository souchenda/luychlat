"use client"

import { useQuery } from "@tanstack/react-query"
import { ActivityIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"

import { adminPost } from "@/components/admin/admin-api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { durationKm, type UptimeMonitor, type UptimeState } from "@/lib/uptime-robot"
import { cn } from "@/lib/utils"

type Data = { configured: false } | { configured: true; checkedAt: string; monitors: UptimeMonitor[] | null; error: string | null }

const STATE: Record<UptimeState, { label: string; dot: string }> = {
  UP: { label: "ដំណើរការ", dot: "bg-emerald-500" },
  DOWN: { label: "ធ្លាក់", dot: "bg-rose-500" },
  PAUSED: { label: "ផ្អាក", dot: "bg-muted-foreground" },
  PENDING: { label: "កំពុងពិនិត្យ", dot: "bg-amber-400" },
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso))

/**
 * UptimeRobot beside the server's health (founder, 5/11/2026): each monitor's state, uptime over 24 hours and 7 days,
 * response time and the last outage — checked from outside every 5 minutes, so it sees what the Droplet's own watchers
 * can't (the whole Droplet down). Read with his read-only key on the server (api/admin/uptime).
 */
export function UptimeCard() {
  const q = useQuery({ queryKey: ["admin-uptime"], queryFn: () => adminPost<Data>("/api/admin/uptime"), refetchInterval: 60_000, staleTime: 30_000 })
  const d = q.data
  const down = d?.configured && d.monitors ? d.monitors.filter((m) => m.state === "DOWN").length : 0

  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex items-center gap-2">
        <ActivityIcon className="size-5 text-primary" />
        <p className="flex-1 font-semibold">UptimeRobot — ពិនិត្យពីខាងក្រៅ</p>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => void q.refetch()} disabled={q.isFetching} aria-label="ពិនិត្យឡើងវិញ">
          {q.isFetching ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
        </Button>
      </div>
      {!d ? (
        <p className="text-sm text-muted-foreground">{q.isError ? "អានមិនបានទេ" : "កំពុងផ្ទុក…"}</p>
      ) : !d.configured ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          មិនទាន់ភ្ជាប់។ បង្កើត Read-only API key នៅ UptimeRobot › Integrations &amp; API ហើយដាក់ក្នុង .env លើ Droplet៖ UPTIMEROBOT_API_KEY
        </p>
      ) : !d.monitors ? (
        <p className="text-sm text-rose-600">{d.error === "unreachable" ? "ទាក់ទង UptimeRobot មិនបានទេ — នឹងព្យាយាមម្ដងទៀត។" : "UptimeRobot បដិសេធ key — សូមពិនិត្យ UPTIMEROBOT_API_KEY (Read-only)។"}</p>
      ) : (
        <>
          <p className={cn("rounded-xl px-3 py-2 text-sm font-medium", down ? "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200")}>
            {down ? `${down} កំពុងធ្លាក់` : `ទាំង ${d.monitors.length} ដំណើរការធម្មតា`}
          </p>
          <ul className="space-y-2">
            {d.monitors.map((m) => (
              <li key={m.name + m.url} className="rounded-xl border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2.5 shrink-0 rounded-full", STATE[m.state].dot)} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{STATE[m.state].label}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-4.5 text-xs text-muted-foreground tabular-nums">
                  <span>24 ម៉ោង {m.day === null ? "—" : `${m.day}%`}</span>
                  <span>7 ថ្ងៃ {m.week === null ? "—" : `${m.week}%`}</span>
                  {m.responseMs !== null && <span>{m.responseMs} ms</span>}
                  {m.lastDown && (
                    <span>
                      ធ្លាក់ចុងក្រោយ {when(m.lastDown.at)}
                      {m.lastDown.seconds === null ? " (នៅធ្លាក់)" : ` · ${durationKm(m.lastDown.seconds)}`}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">ពិនិត្យរៀងរាល់ 5 នាទី ពីខាងក្រៅ · អានចុងក្រោយ {when(d.checkedAt)}</p>
        </>
      )}
    </Card>
  )
}
