import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseRoute, routeOf, threadFor } from "./chat-route"

describe("admin message routing", () => {
  it("a chat, or a chat with its forum topic", () => {
    assert.deepEqual(parseRoute("-1001234567890"), { chatId: -1001234567890, thread: null })
    assert.deepEqual(parseRoute(" -1001234567890:42 "), { chatId: -1001234567890, thread: 42 })
  })
  it("unset or malformed → no route (marketing stays in the founder's chat; devops is not sent)", () => {
    assert.equal(parseRoute(undefined), null)
    assert.equal(parseRoute("@luychlat_ops"), null)
    assert.equal(routeOf("devops", {}), null)
  })
  it("a message to a routed chat lands in its topic; other chats get none", () => {
    const env = { MARKETING_CHAT_ID: "-100111:7", DEVOPS_CHAT_ID: "-100222" }
    assert.equal(threadFor(-100111, env), 7)
    assert.equal(threadFor("-100111", env), 7)
    assert.equal(threadFor(-100222, env), null)
    assert.equal(threadFor(360703728, env), null)
  })
})
