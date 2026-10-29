#!/usr/bin/env bash
# luychlat.com goes out in about five minutes, without waiting for the app's build (founder, 29/10/2026 — «why 45
# minutes?»): run by deploy/auto-update.sh right after it fetches, and by deploy/update.sh after a release as the safety
# net. When the website (Website/, its publish script or the prices script) changed since the last publish, the target
# commit's own copy is published with its own landing-publish.sh — the repository checkout is never moved here. The
# quality gate ran before the push (.githooks/pre-push). Never fails a deploy.
#   deploy/website-sync.sh <commit>
set -uo pipefail
cd "$(dirname "$0")/.."
target=${1:?commit}
stamp_file=deploy/run/.website-published
mkdir -p deploy/run
last=$(cat "$stamp_file" 2>/dev/null || cat deploy/.deployed 2>/dev/null || echo "")
[ -n "$last" ] || { git rev-parse "$target" > "$stamp_file"; exit 0; } # no history: the next change publishes
paths="Website/ deploy/landing-publish.sh deploy/site-prices.py"
# shellcheck disable=SC2086
git diff --quiet "$last" "$target" -- $paths 2>/dev/null && exit 0

echo "=== $(date -Is) website changed: publishing luychlat.com from $(git rev-parse --short "$target")"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git archive "$target" Website deploy/landing-publish.sh | tar -x -C "$tmp" || { echo "! Website not extracted"; exit 0; }
# What changed, for the founder's Telegram notice: the Khmer lines of the commits that touched the website.
WEBSITE_CHANGES=$(git log --format=%B "$last..$target" -- Website/ 2>/dev/null | sed -n 's/^Khmer: *//p' | awk '!seen[$0]++' | head -6 || true)
export WEBSITE_CHANGES
if LANDING_REPO="$(pwd)" WEBSITE_SRC="$tmp/Website" sh "$tmp/deploy/landing-publish.sh"; then
  git rev-parse "$target" > "$stamp_file"
else
  echo "! Website not published — the previous version stays live"
fi
exit 0
