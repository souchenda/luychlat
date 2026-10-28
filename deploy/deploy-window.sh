#!/usr/bin/env sh
# When a release may go live (founder, 28/10/2026 — «អ្នកប្រើមិនគួររអាក់រអួល»). A release that changes the database
# (a new file in supabase/migrations/) goes live only in the quiet hours, 22:00–06:59 Cambodia time, when shops are closed
# and few people use the app; one without a migration goes live at once (blue / green, no gap). An urgent fix overrides
# the wait with a «Deploy-now: <why>» line in one of its commits. Called by deploy/auto-update.sh.
#   deploy-window.sh <hour 0–23, Cambodia> <new migrations> <forced 0|1>   → exit 0 = go live now, 1 = wait
QUIET_FROM=22
QUIET_UNTIL=7
hour=${1:?hour}
migrations=${2:?migrations}
forced=${3:-0}
[ "$migrations" -eq 0 ] && exit 0
[ "$forced" = "1" ] && exit 0
[ "$hour" -ge "$QUIET_FROM" ] || [ "$hour" -lt "$QUIET_UNTIL" ] && exit 0
exit 1
