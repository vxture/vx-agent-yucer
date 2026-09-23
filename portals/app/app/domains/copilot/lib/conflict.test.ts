import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSISTENCY_SESSION_MARK, consistencyQuestion, lastConsistencyCheck, verifyConflict } from "./conflict";

const notes = new Map([
  ["n1", "Called Liu Min today. She is the operations manager and says she decides."],
  ["n2", "Site visit. The new operations director,\nLiu Min, joined the meeting."],
]);
const conflict = (over: Record<string, unknown> = {}) => ({
  topic: "Liu Min's title",
  a: { interactionId: "n1", quote: "She is the operations manager" },
  b: { interactionId: "n2", quote: "The new operations director, Liu Min" },
  ...over,
});

test("a conflict whose two quotes are in their two notes is kept (line breaks do not matter)", () => {
  assert.equal(verifyConflict(conflict(), notes), true);
});

test("QUOTE OR IT DID NOT HAPPEN: an invented quote, an unknown note, or the same note twice is dropped", () => {
  assert.equal(verifyConflict(conflict({ a: { interactionId: "n1", quote: "She is the CFO" } }), notes), false);
  assert.equal(verifyConflict(conflict({ b: { interactionId: "n9", quote: "anything" } }), notes), false);
  assert.equal(verifyConflict(conflict({ b: { interactionId: "n1", quote: "she decides" } }), notes), false);
  assert.equal(verifyConflict(conflict({ topic: " " }), notes), false);
  assert.equal(verifyConflict({ topic: "x" }, notes), false);
  assert.equal(verifyConflict(null, notes), false);
});

test("the question carries the session mark, and the last check is read back from it", () => {
  assert.ok(consistencyQuestion("Acme").startsWith(CONSISTENCY_SESSION_MARK));
  const at = (d: string) => new Date(`${d}T00:00:00Z`);
  const sessions = [
    { subjectId: "acc_1", title: `${CONSISTENCY_SESSION_MARK} Check ...`, updatedAt: at("2026-09-01") },
    { subjectId: "acc_1", title: `${CONSISTENCY_SESSION_MARK} Check ...`, updatedAt: at("2026-09-20") },
    { subjectId: "acc_1", title: "what is going on here?", updatedAt: at("2026-09-21") }, // an ordinary chat
    { subjectId: "acc_2", title: `${CONSISTENCY_SESSION_MARK} Check ...`, updatedAt: at("2026-09-22") }, // another account
  ];
  assert.deepEqual(lastConsistencyCheck(sessions, "acc_1"), at("2026-09-20"));
  assert.equal(lastConsistencyCheck(sessions, "acc_3"), null);
});
