import { test } from "node:test";
import assert from "node:assert/strict";
import { rollupChains } from "./chain-rollup";

test("the account view unions coverage and counts where each role is missing", () => {
  const r = rollupChains([
    { covered: ["economic", "coach"], missing: ["technical", "user"], personIds: ["p1", "p2"] },
    { covered: ["technical"], missing: ["economic", "coach", "user"], personIds: ["p2", "p3"] },
  ]);
  assert.equal(r.deals, 2);
  assert.deepEqual([...r.coveredAnywhere].sort(), ["coach", "economic", "technical"]);
  assert.deepEqual(r.missingOn[0], { role: "user", deals: 2 }, "missing on both deals leads");
  assert.equal(r.people, 3, "a person on two deals is one person");
});
