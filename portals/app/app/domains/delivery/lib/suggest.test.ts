import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSequence, projectsWithoutMilestones } from "./suggest";

test("the first milestone of a project is number 1, not 0", () => {
  assert.equal(nextSequence([], "p1"), 1);
  assert.equal(nextSequence([{ projectId: "p2", sequence: 5 }], "p1"), 1);
});

test("after that it is max+1, and holes are left alone", () => {
  // 1,2,5 -> 6. A gap usually means a milestone was skipped on purpose, and
  // filling it would renumber history.
  const ms = [1, 2, 5].map((sequence) => ({ projectId: "p1", sequence }));
  assert.equal(nextSequence(ms, "p1"), 6);
});

test("only DELIVERING projects are owed milestones", () => {
  const out = projectsWithoutMilestones(
    [
      { id: "a", name: "A", status: "delivering" },
      { id: "b", name: "B", status: "delivering" },
      { id: "c", name: "C", status: "completed" },
    ],
    [{ projectId: "a" }],
  );
  assert.deepEqual(out.map((p) => p.id), ["b"]);
});
