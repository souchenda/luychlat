import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { LATEST_APK } from "./apk-version"
import { ANDROID_APK_PATH, BOT_URL, DOWNLOAD_COPY, DOWNLOAD_PAGE_URL } from "./download-links"
import { APP_LINKS } from "./post-footer"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")

describe("The download page app.luychlat.com/download (Task #527)", () => {
  it("is the address shared in the post footer, never the raw .apk", () => {
    assert.equal(DOWNLOAD_PAGE_URL, "https://app.luychlat.com/download")
    assert.equal(APP_LINKS.find((l) => l.label === "Android (APK)")?.url, DOWNLOAD_PAGE_URL)
  })
  it("downloads the newest APK and names its version", () => {
    assert.equal(ANDROID_APK_PATH, "/LuyChlat.apk")
    assert.ok(DOWNLOAD_COPY.km.android.button.includes(LATEST_APK.version))
    assert.ok(DOWNLOAD_COPY.en.android.button.includes(LATEST_APK.version))
    assert.equal(BOT_URL, "https://t.me/luychlat_bot")
  })
  it("Khmer copy: the brand «អេប លុយឆ្លាត», never «កម្មវិធី» / «អែប» / «&», digits 0-9 only", () => {
    const km = JSON.stringify(DOWNLOAD_COPY.km)
    assert.ok(km.includes("អេប លុយឆ្លាត"))
    for (const bad of ["កម្មវិធី", "អែប", "&"]) assert.ok(!km.includes(bad), bad)
    assert.doesNotMatch(km, /[០-៩]/)
    // The lesson of 27/10/2026: a second copy in Secure Folder / Dual App kept its own Adhan alarms.
    assert.match(DOWNLOAD_COPY.km.android.note, /Secure Folder/)
  })
  it("is a public page with its own QR code", () => {
    const page = read("src/app/download/page.tsx")
    assert.match(page, /QRCode\.toString\(DOWNLOAD_PAGE_URL/)
    assert.doesNotMatch(read("src/app/download/download-view.tsx"), /useSessionStore|redirect/)
  })
})

describe("The download page is public (Task #527)", () => {
  it("never shows the «can't load data» banner to a visitor who is not signed in", async () => {
    const { isPublicPath } = await import("./query-client")
    assert.equal(isPublicPath("/download"), true)
  })
})
