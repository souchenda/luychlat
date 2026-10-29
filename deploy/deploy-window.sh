#!/usr/bin/env sh
# When a release may go live (founder, 28/10/2026 — «អ្នកប្រើមិនគួររអាក់រអួល»). A release with a database change that
# removes or renames something (a «-- contract:» migration) goes live only in the quiet hours, 22:00–06:59 Cambodia time,
# when shops are closed and few people use the app; everything else — additive migrations included (founder, 29/10/2026)
# — goes live at once (blue / green, no gap). «Deploy-now: <why>» in a commit overrides the wait. Called by auto-update.sh.
#   deploy-window.sh <hour 0–23, Cambodia> <contract migrations> <forced 0|1>   → exit 0 = go live now, 1 = wait
QUIET_FROM=22
QUIET_UNTIL=7
hour=${1:?hour}
migrations=${2:?migrations}
forced=${3:-0}
[ "$migrations" -eq 0 ] && exit 0
[ "$forced" = "1" ] && exit 0
[ "$hour" -ge "$QUIET_FROM" ] || [ "$hour" -lt "$QUIET_UNTIL" ] && exit 0
exit 1
