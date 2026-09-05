import { test } from "node:test";
import assert from "node:assert/strict";
import { accountsWithoutOpenDeal } from "./suggest";

test("worked customers with no open deal lead; churned ones do not count", () => {
  const out = accountsWithoutOpenDeal(
    [
      { id: "a", name: "A", status: "active" },
      { id: "b", name: "B", status: "prospect" },
      { id: "c", name: "C", status: "churned" },
    ],
    [{ accountId: "a", status: "open" }],
  );
  assert.deepEqual(out.map((a) => a.id), ["b"]);
});

test("a CLOSED deal does not make a customer covered", () => {
  // Won last year and nothing open now is exactly the customer this list is
  // for - renewal ground with no live pursuit.
  const out = accountsWithoutOpenDeal(
    [{ id: "a", name: "A", status: "active" }],
    [{ accountId: "a", status: "won" }],
  );
  assert.deepEqual(out.map((a) => a.id), ["a"]);
});
