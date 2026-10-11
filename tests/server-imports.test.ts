/**
 * Server code (the Telegram bot, API routes) must never import a value from a "use client" module:
 * on the server it becomes a client reference, its values `undefined`. On 11/10/2026 the bot's
 * buttons were built from such a value ("undefined/transactions") and Telegram refused the messages
 * — a photo got no reply, a loan import no confirmation. Type-only imports are fine (erased).
 */
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, it } from "node:test"

const ROOT = join(import.meta.dirname, "..")
const SRC = join(ROOT, "src")

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

function resolve(spec: string): string | null {
  const base = join(SRC, spec.slice(2))
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(candidate)) return candidate
  return null
}

const isClient = (path: string) => /^\s*(?:\/\/[^\n]*\n\s*)*["']use client["']/.test(readFileSync(path, "utf8"))

/** Value imports from "@/…" (not `import type`, not `import { type … }` only). */
function valueImports(source: string): string[] {
  const out: string[] = []
  for (const m of source.matchAll(/^import\s+(type\s+)?([^;]*?)\s+from\s+["'](@\/[^"']+)["']/gm)) {
    if (m[1]) continue
    const names = m[2]
    const braces = /^\{([^}]*)\}$/.exec(names.trim())
    if (braces && braces[1].split(",").every((n) => !n.trim() || /^type\s/.test(n.trim()))) continue
    out.push(m[3])
  }
  for (const m of source.matchAll(/import\(\s*["'](@\/[^"']+)["']\s*\)/g)) out.push(m[1])
  return out
}

describe("server code imports no values from client modules", () => {
  const server = [...files(join(SRC, "lib", "server")), ...files(join(SRC, "app", "api"))]
  it(`${server.length} server files checked`, () => {
    const problems: string[] = []
    for (const file of server) {
      for (const spec of valueImports(readFileSync(file, "utf8"))) {
        const target = resolve(spec)
        if (target && isClient(target)) problems.push(`${relative(ROOT, file)} → ${spec}`)
      }
    }
    assert.deepEqual(problems, [])
  })
})
