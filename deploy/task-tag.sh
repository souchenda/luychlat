#!/bin/sh
# The task number a release carries (founder, 26/10/2026 — Task #515: the deploy card said «#512» for Task #514). Reads
# the messages of the release's commits — `git log --format='%B%x1e' <last announced>..HEAD` — and prints the highest task
# a commit names as its own: the FIRST «Task #514», «Task: #049», «task #9» or «កិច្ចការទី #514» / «កិច្ចការ: #49» in each
# message (later mentions — «Task #497's rule still holds» — are references, not the commit's task). Prints nothing when
# no commit names one; the deploy card then counts on from the last release as before. Plain ERE (gawk and mawk alike);
# tested by tests/deploy-task-tag.test.ts.
awk -v RS='\036' '
  {
    if (match($0, /([Tt][Aa][Ss][Kk]|កិច្ចការ(ទី)?)[ \t]*(:[ \t]*#?|#)[0-9]+/)) {
      s = substr($0, RSTART, RLENGTH)
      sub(/.*[^0-9]/, "", s)
      if (s + 0 > max) max = s + 0
    }
  }
  END { if (max > 0) print max }
'
