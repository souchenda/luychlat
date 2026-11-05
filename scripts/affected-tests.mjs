// The tests a release really needs (founder, 5/11/2026 — mandatory: «test only the part that was changed, wherever»):
// from the files changed since the deployed version (deploy/update.sh writes them to changed-files.txt before the build),
// the test files that cover them — a changed test itself, the *.test.ts beside a changed module, and every test that
// names the changed module or file. Prints the test files one per line, «ALL» when the whole suite must run (no list, or
// a change to the toolchain: package.json, the lock file, tsconfig, the Dockerfile, the test runner), or nothing.
//
//   node scripts/affected-tests.mjs changed-files.txt
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

const EVERYTHING = /^(package\.json|package-lock\.json|tsconfig[^/]*\.json|Dockerfile|\.dockerignore|scripts\/affected-tests\.mjs)$/

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = path.posix.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith(".test.ts")) out.push(p)
  }
  return out
}

/** The words a test uses to name a changed file: its import path without the extension, or its file name. */
function namesOf(file) {
  const noExt = file.replace(/\.(tsx?|mjs|js)$/, "")
  const names = new Set([path.posix.basename(file)])
  if (noExt !== file) {
    // «@/lib/helpline/site», «./site», «lib/helpline/site» …
    const inSrc = noExt.replace(/^src\//, "")
    names.add(`@/${inSrc}"`)
    names.add(`${inSrc}"`)
    names.add(`./${path.posix.basename(noExt)}"`)
    names.add(`${inSrc}.ts`)
    names.add(`${inSrc}.tsx`)
    names.add(file)
  }
  return [...names]
}

export function affected(changed, tests, read) {
  const files = changed.map((f) => f.trim()).filter(Boolean)
  if (!files.length || files.some((f) => f === "ALL" || EVERYTHING.test(f))) return "ALL"
  const picked = new Set()
  for (const f of files) {
    if (f.endsWith(".test.ts")) {
      if (tests.includes(f)) picked.add(f)
      continue
    }
    const beside = f.replace(/\.(tsx?|mjs)$/, ".test.ts")
    if (beside !== f && tests.includes(beside)) picked.add(beside)
  }
  // Notes and guides (CLAUDE.md, docs/…) change no behaviour; ROADMAP.md feeds the reports, so it counts.
  const names = files.filter((f) => !f.endsWith(".test.ts") && (!f.endsWith(".md") || f === "ROADMAP.md")).flatMap(namesOf)
  if (names.length)
    for (const t of tests) {
      if (picked.has(t)) continue
      const body = read(t)
      if (names.some((n) => body.includes(n))) picked.add(t)
    }
  return [...picked].sort()
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const list = process.argv[2] && existsSync(process.argv[2]) ? readFileSync(process.argv[2], "utf8").split("\n") : []
  const tests = [...walk("src"), ...walk("tests")]
  const r = affected(list, tests, (t) => readFileSync(t, "utf8"))
  console.log(r === "ALL" ? "ALL" : r.join("\n"))
}
