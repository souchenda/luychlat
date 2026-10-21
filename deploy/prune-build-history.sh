#!/usr/bin/env bash
# Docker's build history (founder, 21/10/2026): BuildKit keeps a record of every build in containerd's «moby_history»
# namespace, and each record pins that build's layers — 546 records since 07/10 held ~30 GB that no prune reached
# (`docker builder prune` sees them as shared). This removes the records older than $1 hours (default 24) — the same as
# `docker buildx history rm` (no buildx on the Droplet) — then lets containerd free what nothing references any more.
# Zero downtime: no daemon restart; builds and running containers are untouched; only past build records go.
# Run by update.sh after every release (under the deploy lock), and by hand under the deploy and APK locks.
set -u

HOURS=${1:-24}
cutoff=$(( $(date +%s) - HOURS * 3600 ))
free_gb() { df -BG / | awk 'NR==2 { sub(/G$/, "", $4); print $4 }'; }
before=$(free_gb)

ids=()
while read -r id created _; do
  [ -n "$id" ] || continue
  t=$(date -d "$created" +%s 2>/dev/null) || continue
  [ "$t" -lt "$cutoff" ] && ids+=("$id")
done < <(ctr -n moby_history leases ls 2>/dev/null | tail -n +2)

removed=0
for ((i = 0; i < ${#ids[@]}; i += 50)); do
  batch=("${ids[@]:i:50}")
  # --sync: the leases and every resource nothing else references go now, not at the next garbage collection.
  if ctr -n moby_history leases delete --sync "${batch[@]}" >/dev/null 2>&1; then removed=$(( removed + ${#batch[@]} )); fi
done

# The build cache those records held is no longer shared: trim it to its newest 2 GB (as update.sh does).
docker builder prune -af --keep-storage 2GB >/dev/null 2>&1 || true

echo "✓ Build history: ${removed} record(s) older than ${HOURS} h removed · disk free ${before} GB → $(free_gb) GB"
