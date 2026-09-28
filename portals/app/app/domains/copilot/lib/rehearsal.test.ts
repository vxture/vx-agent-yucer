import { test } from "node:test";
import assert from "node:assert/strict";
import { REHEARSAL_MARK, rehearsalFrame } from "./rehearsal";

// 预演 (deal batch 11c): the frame names the deal, marks the turn and says it
// feeds nothing. It is framing - never stored as the member's message.

test("the rehearsal frame is marked, names the deal, and forbids proposals and invention", () => {
  const f = rehearsalFrame("实验室数据对接");
  assert.ok(f.startsWith(REHEARSAL_MARK));
  assert.match(f, /"实验室数据对接"/);
  assert.match(f, /is a judgement, a proposal or a forecast: do not propose/);
  assert.match(f, /Do not invent facts/);
});

test("a member's conversation is one whose title carries no run mark", async () => {
  const { isMemberConversation } = await import("./rehearsal");
  assert.equal(isMemberConversation("东海精密仪器下一步怎么推？"), true);
  assert.equal(isMemberConversation(null), true);
  assert.equal(isMemberConversation("[meeting-pack] Prepare the next meeting"), false);
  assert.equal(isMemberConversation("[rehearsal] 如果对方说价格太高"), false);
  // A member may type a bracket; only the lower-case run marks count.
  assert.equal(isMemberConversation("[紧急] 帮我看看"), true);
});
