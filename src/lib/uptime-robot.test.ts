import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { durationKm, parseMonitors, stateOf } from "./uptime-robot"

describe("UptimeRobot in the Control Center (founder, 5/11/2026)", () => {
  it("the states: up, down (seems down too), paused, not checked yet", () => {
    assert.equal(stateOf(2), "UP")
    assert.equal(stateOf(8), "DOWN")
    assert.equal(stateOf(9), "DOWN")
    assert.equal(stateOf(0), "PAUSED")
    assert.equal(stateOf(1), "PENDING")
    assert.equal(stateOf(undefined), "PENDING")
  })

  it("the API's answer → name, state, uptime 24 h / 7 d, response time, the last outage and its length", () => {
    const r = parseMonitors({
      stat: "ok",
      monitors: [
        { friendly_name: "Keyword on app.luychlat.com/api/health", url: "https://app.luychlat.com/api/health", status: 2, custom_uptime_ratio: "100.000-99.874", average_response_time: "212.40", logs: [{ type: 2, datetime: 1_793_800_000 }, { type: 1, datetime: 1_793_799_100, duration: 900 }] },
        { friendly_name: "luychlat.com/", url: "https://luychlat.com/", status: 9, custom_uptime_ratio: "98.5-99.7", logs: [{ type: 1, datetime: 1_793_860_000, duration: 120 }] },
      ],
    })!
    assert.deepEqual(r[0], { name: "Keyword on app.luychlat.com/api/health", url: "https://app.luychlat.com/api/health", state: "UP", day: 100, week: 99.87, responseMs: 212, lastDown: { at: new Date(1_793_799_100_000).toISOString(), seconds: 900 } })
    assert.equal(r[1].state, "DOWN")
    assert.equal(r[1].lastDown!.seconds, null) // still down: no length yet
    assert.equal(r[1].responseMs, null)
  })

  it("an error from the API (a wrong key) is null, never an empty «all fine»", () => {
    assert.equal(parseMonitors({ stat: "fail", error: { type: "invalid_parameter" } }), null)
    assert.equal(parseMonitors(null), null)
  })

  it("durations in Khmer with 0-9 digits", () => {
    assert.equal(durationKm(45), "45 វិនាទី")
    assert.equal(durationKm(900), "15 នាទី")
    assert.equal(durationKm(7_500), "2 ម៉ោង 5 នាទី")
    assert.equal(durationKm(90_000), "1 ថ្ងៃ 1 ម៉ោង")
  })
})
