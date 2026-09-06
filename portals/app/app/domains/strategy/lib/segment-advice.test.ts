import { test } from "node:test";
import assert from "node:assert/strict";
import { analyseSegments, type SegmentAdviceInput } from "./segment-advice";

const seg = (
  code: string,
  over: Partial<SegmentAdviceInput["segments"][number]> = {},
) => ({
  id: `id_${code}`,
  segmentCode: code,
  name: `细分 ${code}`,
  planId: "plan_1",
  status: "active" as const,
  criteria: { industries: ["retail"], regions: ["east"] },
  ...over,
});

const run = (
  segments: SegmentAdviceInput["segments"],
  counts: Record<string, { assigned: number; matched: number }> = {},
  mismatch: Record<string, { assignedNotMatching: number; matchingNotAssigned: number }> = {},
) =>
  analyseSegments({
    segments,
    counts: new Map(Object.entries(counts)),
    mismatch: new Map(Object.entries(mismatch)),
  });

const kinds = (out: ReturnType<typeof analyseSegments>) => out.map((a) => a.kind);

test("a code handed out against the definition is the loudest finding", () => {
  const out = run(
    [seg("A")],
    { A: { assigned: 5, matched: 3 } },
    { A: { assignedNotMatching: 2, matchingNotAssigned: 0 } },
  );
  assert.deepEqual(kinds(out), ["assigned_not_matching"]);
  assert.equal(out[0]!.count, 2);
});

test("customers the definition finds but nobody cut in are named too", () => {
  const out = run(
    [seg("A")],
    { A: { assigned: 3, matched: 5 } },
    { A: { assignedNotMatching: 0, matchingNotAssigned: 2 } },
  );
  assert.deepEqual(kinds(out), ["matching_not_assigned"]);
  assert.equal(out[0]!.count, 2);
});

test("both directions at once are two findings, worst first", () => {
  const out = run(
    [seg("A")],
    { A: { assigned: 4, matched: 4 } },
    { A: { assignedNotMatching: 1, matchingNotAssigned: 1 } },
  );
  assert.deepEqual(kinds(out), ["assigned_not_matching", "matching_not_assigned"]);
});

test("a cut with no definition is not blamed for matching nobody", () => {
  const out = run(
    [seg("A", { criteria: { industries: [], regions: [] } })],
    { A: { assigned: 3, matched: 0 } },
    { A: { assignedNotMatching: 3, matchingNotAssigned: 0 } },
  );
  // The divergence is not reported: it follows from the empty definition, and
  // reporting both would be saying the same thing twice.
  assert.deepEqual(kinds(out), ["no_criteria"]);
});

test("a paused cut is quiet unless accounts still carry its code", () => {
  assert.deepEqual(
    kinds(run([seg("A", { status: "paused" })], { A: { assigned: 0, matched: 4 } })),
    [],
  );
  const stale = run([seg("A", { status: "retired" })], { A: { assigned: 6, matched: 0 } });
  assert.deepEqual(kinds(stale), ["stale_assignment"]);
  assert.equal(stale[0]!.count, 6);
});

test("a cut nobody is spending against is named, and can coexist with a divergence", () => {
  const out = run(
    [seg("A", { planId: null })],
    { A: { assigned: 2, matched: 1 } },
    { A: { assignedNotMatching: 1, matchingNotAssigned: 0 } },
  );
  assert.deepEqual(kinds(out), ["assigned_not_matching", "no_plan"]);
});

test("a sound segmentation says nothing at all", () => {
  const out = run([seg("A")], { A: { assigned: 4, matched: 4 } }, { A: { assignedNotMatching: 0, matchingNotAssigned: 0 } });
  assert.deepEqual(out, []);
});
