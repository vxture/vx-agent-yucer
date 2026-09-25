import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, inputFingerprint, runIdOf } from "./briefing";

const run = (input: unknown) => ({
  capability: "account.consistency",
  kind: "consistency_check" as const,
  subjectType: "account" as const,
  subjectId: "acc_1",
  input,
});

test("canonical JSON sorts keys at every depth and keeps array order", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, 1], c: null } }), '{"a":{"c":null,"d":[2,1]},"b":1}');
  assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
});

test("the same input is one fingerprint however its keys were written; any change is another", () => {
  const a = inputFingerprint(run({ question: "q", notes: [{ id: "n1", text: "x" }] }));
  const b = inputFingerprint(run({ notes: [{ text: "x", id: "n1" }], question: "q" }));
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, inputFingerprint(run({ question: "q", notes: [{ id: "n1", text: "y" }] })));
  assert.notEqual(a, inputFingerprint({ ...run({ question: "q", notes: [{ id: "n1", text: "x" }] }), subjectId: "acc_2" }));
});

test("the run id is the fingerprint shaped as a UUID - deterministic, never random", () => {
  const f = inputFingerprint(run({ q: 1 }));
  assert.equal(runIdOf(f), runIdOf(f));
  assert.match(runIdOf(f), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
