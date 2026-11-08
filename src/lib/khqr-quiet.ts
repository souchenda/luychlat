/**
 * «Record only» KHQR businesses (founder, 8/11/2026). A shop whose own device already announces each payment
 * (e.g. «ហាងឆ្លាត», paid at PPCBank) wants App Luy Chlat only to record it: no private message, no SoundBox,
 * no voice, no push — one announcer, never two. The database answers `quiet` (workspaces.khqr_quiet) with
 * every ingest; only a strict `true` silences, so a missing or odd value keeps today's behaviour.
 * A HELD payment (no wallet of the receiving bank) is still asked: money is never booked by a guess.
 */
export const khqrQuiet = (r: { quiet?: unknown } | null | undefined): boolean => r?.quiet === true
