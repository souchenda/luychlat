import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { approvalFromEnv, parseRoute, reviewChats, routeOf, threadFor } from "./chat-route"

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

describe("content previews go to the approval group «LCA Approval» (founder, 19/10/2026)", () => {
  const none = () => false
  it("the approval group first, then the marketing chat, then the super admins' private chats", () => {
    assert.deepEqual(reviewChats({ approval: -5001, marketing: -6001, superAdmins: [11, 12], isPublic: none }), [-5001])
    assert.deepEqual(reviewChats({ approval: null, marketing: -6001, superAdmins: [11], isPublic: none }), [-6001])
    assert.deepEqual(reviewChats({ approval: null, marketing: null, superAdmins: [11, 12], isPublic: none }), [11, 12])
  })
  it("never a public channel, even if one is configured as the approval chat by mistake", () => {
    assert.deepEqual(reviewChats({ approval: -1001, marketing: null, superAdmins: [11], isPublic: (id) => id === -1001 }), [11])
  })
  it("TELEGRAM_APPROVAL_CHAT_ID (or APPROVAL_GROUP_ID) in the environment", () => {
    assert.equal(approvalFromEnv({ TELEGRAM_APPROVAL_CHAT_ID: "-1009876543210" }), -1009876543210)
    assert.equal(approvalFromEnv({ APPROVAL_GROUP_ID: "-5553236898" }), -5553236898)
    assert.equal(approvalFromEnv({}), null)
    assert.equal(approvalFromEnv({ TELEGRAM_APPROVAL_CHAT_ID: "LCA" }), null)
  })
})
