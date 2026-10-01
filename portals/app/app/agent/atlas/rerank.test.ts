import { test } from "node:test";
import assert from "node:assert/strict";
import { RERANK_TEXT_MAX_CHARS, parseRerankScores, selectEvidence, toRerankCandidate } from "./rerank";

// The live answer of 2026-09-30 for a relevant and an irrelevant text.
const LIVE = { modelCode: "rerank", scores: [{ id: "a", score: 1 }, { id: "b", score: 0.99709916 }] };

test("the answer is read as id -> score; any other shape is refused, not guessed at", () => {
  assert.deepEqual([...parseRerankScores(LIVE)!], [["a", 1], ["b", 0.99709916]]);
  assert.equal(parseRerankScores({ results: [{ index: 0, score: 1 }] }), null);
  assert.equal(parseRerankScores({ scores: [] }), null);
  assert.equal(parseRerankScores({ scores: [{ id: "a", score: "high" }] }), null);
  assert.equal(parseRerankScores({ scores: [{ id: "a", score: 1 }, { id: 2, score: 1 }] }), null, "one bad row refuses the lot");
  assert.equal(parseRerankScores(null), null);
});

test("a candidate's text is cut before it is sent", () => {
  assert.equal(toRerankCandidate("n1", "短").text, "短");
  assert.equal(toRerankCandidate("n1", "x".repeat(RERANK_TEXT_MAX_CHARS + 500)).text.length, RERANK_TEXT_MAX_CHARS);
});

// Twelve notes, newest first: n0 is the newest.
const notes = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}` }));
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

test("the newest few are kept whatever they score; the rest of the places go to the best ranked", () => {
  // Only n9 and n7 are relevant. n0-n2 score worst of all.
  const scores = new Map(notes.map((n) => [n.id, n.id === "n9" ? 0.9 : n.id === "n7" ? 0.8 : n.id < "n3" ? 0 : 0.1]));
  const { chosen, byRelevance } = selectEvidence(notes, scores, 6, 3);
  assert.equal(byRelevance, true);
  assert.deepEqual(ids(chosen), ["n0", "n1", "n2", "n7", "n9", "n3"].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))));
  assert.ok(chosen.some((n) => n.id === "n9"), "the old but relevant note is there");
});

test("what is chosen is shown newest first, not in score order", () => {
  const scores = new Map(notes.map((n, i) => [n.id, i])); // older = higher
  const { chosen } = selectEvidence(notes, scores, 5, 2);
  const order = ids(chosen).map((id) => Number(id.slice(1)));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("equal scores fall back to the more recent", () => {
  const flat = new Map(notes.map((n) => [n.id, 0.5]));
  assert.deepEqual(ids(selectEvidence(notes, flat, 5, 2).chosen), ["n0", "n1", "n2", "n3", "n4"]);
});

test("no scores, or nothing to choose between, is the old rule: the newest", () => {
  assert.deepEqual(ids(selectEvidence(notes, null, 4, 2).chosen), ["n0", "n1", "n2", "n3"]);
  assert.equal(selectEvidence(notes, null, 4, 2).byRelevance, false);
  assert.deepEqual(ids(selectEvidence(notes.slice(0, 3), new Map(), 4, 2).chosen), ["n0", "n1", "n2"]);
});

test("a note the answer did not score ranks last rather than being dropped from the pool", () => {
  const partial = new Map([["n11", 0.9]]);
  const { chosen } = selectEvidence(notes, partial, 4, 2);
  assert.ok(chosen.some((n) => n.id === "n11"));
  assert.equal(chosen.length, 4);
});
