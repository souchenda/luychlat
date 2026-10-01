// Copies static assets next to the standalone server so it can run on its own
// (the Dockerfile does the same with COPY). Used by `npm run build:standalone`
// for PM2 deployments: then run `node .next/standalone/server.js`.
import { cp, rm } from "node:fs/promises"

const target = ".next/standalone"
await rm(`${target}/.next/static`, { recursive: true, force: true })
await cp(".next/static", `${target}/.next/static`, { recursive: true })
await rm(`${target}/public`, { recursive: true, force: true })
await cp("public", `${target}/public`, { recursive: true })
console.log("standalone server ready: node .next/standalone/server.js")
