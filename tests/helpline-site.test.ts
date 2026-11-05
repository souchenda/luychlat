import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("the helpline on luychlat.com — wired safely (founder, 5/11/2026)", () => {
  it("the route answers only luychlat.com, rate-limits every visitor, and is open only with the PUBLIC flag or the team's test", () => {
    const route = read("src/app/api/helpline/site/route.ts")
    assert.match(route, /const SITE = "https:\/\/luychlat\.com"/)
    assert.match(route, /if \(origin !== null && origin !== SITE\) return null/)
    assert.match(route, /limited\(request, "send", 5, 24 \* 3_600_000\)/) // a few questions to the founder a day per visitor
    assert.match(route, /bot_helpline_site_on/)
    assert.match(route, /siteReply\(text, lang\)/) // the approved knowledge only
    assert.match(read("supabase/migrations/20270294000000_helpline_site.sql"), /f\.status = 'PUBLIC' from public\.feature_flags f where f\.key = 'helpline'/)
  })

  // Website/ and deploy/ are not in the Docker build context.
  it("the page puts the server's words on the screen as text, never HTML; every page loads it; the CSP lets it call the app", { skip: !existsSync(join(process.cwd(), "Website/helpline.js")) && "Website/ not here" }, () => {
    const js = read("Website/helpline.js")
    assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write/)
    // A person, not a bot (founder, 5/11/2026): a greeting that asks what we can solve now — never a list of questions.
    assert.doesNotMatch(js, /hl-chip|chips\(/)
    assert.match(js, /តើលោកអ្នកមានបញ្ហាអ្វី ដែលក្រុមការងារយើងអាចជួយដោះស្រាយជូនបានភ្លាមៗទេ\?/)
    const app = read("src/components/helpline/helpline-chat.tsx")
    assert.doesNotMatch(app, /QUICK_IDS|chips/)
    assert.match(app, /តើលោកអ្នកមានបញ្ហាអ្វី ដែលក្រុមការងារយើងអាចជួយដោះស្រាយជូនបានភ្លាមៗទេ\?/)
    assert.match(js, /var API = "https:\/\/app\.luychlat\.com\/api\/helpline\/site"/)
    for (const p of ["index.html", "personal.html", "family.html", "business.html", "islamic.html", "privacy.html", "delete-account.html"])
      for (const dir of ["", "en/", "zh/"]) {
        const file = dir + (dir && p === "index.html" ? "index.html" : p)
        assert.match(read(`Website/${file}`), /<script src="(\.\.\/)?helpline\.js" defer/, file)
      }
    if (existsSync(join(process.cwd(), "deploy/landing-publish.sh"))) {
      const publish = read("deploy/landing-publish.sh")
      assert.match(publish, /site\.js helpline\.js/)
      assert.match(publish, /connect-src 'self' https:\/\/cloudflareinsights\.com https:\/\/app\.luychlat\.com;/)
    }
  })
})
