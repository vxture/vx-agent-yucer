import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignsWithoutExecutions } from "./suggest";

test("a running campaign with no items is the gap; done and draft are not", () => {
  const out = campaignsWithoutExecutions(
    [
      { id: "a", name: "A", status: "running" },
      { id: "b", name: "B", status: "running" },
      { id: "c", name: "C", status: "completed" },
      { id: "d", name: "D", status: "draft" },
    ],
    [{ campaignId: "a" }],
  );
  assert.deepEqual(out.map((c) => c.id), ["b"]);
});
