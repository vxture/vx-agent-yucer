import { test } from "node:test";
import assert from "node:assert/strict";
import { citationsForAnswer } from "./citations";

const note = { id: "note-123", occurredAt: new Date("2026-11-01T00:00:00Z") };

test("links only exact citations present in server-read records, once each", () => {
  const citations = citationsForAnswer("[note-123] note-123; [invented-456]", "account-1", [note, note]);
  assert.equal(citations.length, 1);
  assert.equal(citations[0].href, "/account/account-1/evidence/note-123");
  assert.match(citations[0].label, /2026-11-01/);
  assert.deepEqual(citationsForAnswer("note-1234 prefixnote-123", "account-1", [note]), []);
});

test("no records means no clickable claims, and path segments cannot inject a URL", () => {
  assert.deepEqual(citationsForAnswer("[note-123] https://attacker.example", "account-1", []), []);
  const [citation] = citationsForAnswer("[note-123]", "../other?x=1", [note]);
  assert.equal(citation.href, "/account/..%2Fother%3Fx%3D1/evidence/note-123");
});
