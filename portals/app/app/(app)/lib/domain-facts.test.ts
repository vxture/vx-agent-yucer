import { test } from "node:test";
import assert from "node:assert/strict";
import { fact, visibleFacts } from "./domain-facts";

test("a refused read is absent, never zero", () => {
  // The rule the bell follows too: a domain home must not report the size of
  // work its reader is not allowed to see, and "0" is a report.
  const facts = [fact("a", 3, "/x"), fact("b", null, "/y"), fact("c", 0, "/z")];
  assert.deepEqual(visibleFacts(facts).map((f) => f.key), ["a", "c"]);
});

test("zero is never an attention state, whatever the fact claims", () => {
  assert.equal(fact("backlog", 0, "/x", true).attention, false);
  assert.equal(fact("backlog", 1, "/x", true).attention, true);
});

test("a plain inventory figure never asks for attention", () => {
  assert.equal(fact("products", 42, "/catalog").attention, false);
});

test("a refused read cannot become an attention state", () => {
  assert.equal(fact("backlog", null, "/x", true).attention, false);
});
