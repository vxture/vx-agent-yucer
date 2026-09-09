import { test } from "node:test";
import assert from "node:assert/strict";
import { readFunnel, type ExitInput, type StageInput } from "./funnel";
import { FUNNEL_STAGES, type FunnelStage } from "./funnel-exit";

const empty: StageInput = { open: 0, advanced: 0, exited: 0 };

const stages = (
  over: Partial<Record<FunnelStage, StageInput>> = {},
): Record<FunnelStage, StageInput> => ({
  signal: empty,
  lead: empty,
  opportunity: empty,
  project: empty,
  revenue: empty,
  ...over,
});

/** find() hands over the READING, not the stage name. */
const at = (s: FunnelStage) => (r: { stage: FunnelStage }) => r.stage === s;

test("a stage reports everything that ever reached it", () => {
  const f = readFunnel(stages({ signal: { open: 3, advanced: 5, exited: 2 } }), []);
  const sig = f.stages[0];
  assert.equal(sig.reached, 10);
  assert.equal(sig.passRate, 0.5);
});

test("nothing reached is null, not zero", () => {
  // "Nothing has got this far" and "everything that got here died" are
  // opposite readings; 0% for both would report an empty funnel as a disaster.
  const f = readFunnel(stages(), []);
  assert.equal(f.stages[0].passRate, null);
  const dead = readFunnel(stages({ lead: { open: 0, advanced: 0, exited: 4 } }), []);
  assert.equal(dead.stages[1].passRate, 0);
});

test("the stages come back in funnel order, always all five", () => {
  const f = readFunnel(stages(), []);
  assert.deepEqual(f.stages.map((s) => s.stage), [...FUNNEL_STAGES]);
});

// --- what entered, and what is alive -----------------------------------------

test("entered is the FIRST stage, not the sum", () => {
  // A lead that came from a signal is one piece of demand counted twice.
  // Adding the stages up would report every conversion as new business.
  const f = readFunnel(
    stages({
      signal: { open: 1, advanced: 4, exited: 1 },
      lead: { open: 2, advanced: 2, exited: 0 },
    }),
    [],
  );
  assert.equal(f.entered, 6);
});

test("live counts what is still open at every stage", () => {
  const f = readFunnel(
    stages({ signal: { open: 1, advanced: 0, exited: 0 }, project: { open: 2, advanced: 0, exited: 0 } }),
    [],
  );
  assert.equal(f.live, 3);
});

// --- the leak ----------------------------------------------------------------

test("reasons are grouped per stage, commonest first", () => {
  const exits: ExitInput[] = [
    { stage: "lead", reasonCode: "no_budget" },
    { stage: "lead", reasonCode: "no_budget" },
    { stage: "lead", reasonCode: "timing" },
    { stage: "signal", reasonCode: "not_a_fit" },
  ];
  const f = readFunnel(
    stages({ signal: { open: 0, advanced: 0, exited: 1 }, lead: { open: 0, advanced: 0, exited: 3 } }),
    exits,
  );
  const lead = f.stages.find(at("lead"))!;
  assert.deepEqual(lead.reasons, [
    { code: "no_budget", count: 2 },
    { code: "timing", count: 1 },
  ]);
  assert.deepEqual(f.stages.find(at("signal"))!.reasons, [{ code: "not_a_fit", count: 1 }]);
});

test("the stage that lost the most is named", () => {
  const f = readFunnel(
    stages({
      signal: { open: 0, advanced: 0, exited: 2 },
      opportunity: { open: 0, advanced: 0, exited: 7 },
    }),
    [],
  );
  assert.equal(f.biggestLeak?.stage, "opportunity");
});

test("nothing ended anywhere means no leak to name", () => {
  const f = readFunnel(stages({ signal: { open: 3, advanced: 0, exited: 0 } }), []);
  assert.equal(f.biggestLeak, null);
});

// --- the page's own blind spot -----------------------------------------------

test("subjects that ended with no reason recorded are COUNTED, not hidden", () => {
  // Only some stages have a surface that asks. A funnel that quietly showed
  // "no reasons" for the rest would read as "nothing went wrong there".
  const f = readFunnel(
    stages({ project: { open: 0, advanced: 0, exited: 5 } }),
    [{ stage: "project", reasonCode: "customer_withdrew" }],
  );
  const proj = f.stages.find(at("project"))!;
  assert.equal(proj.unexplained, 4);
});

test("fully explained leaves nothing unexplained", () => {
  const f = readFunnel(
    stages({ lead: { open: 0, advanced: 0, exited: 1 } }),
    [{ stage: "lead", reasonCode: "not_a_fit" }],
  );
  assert.equal(f.stages.find(at("lead"))!.unexplained, 0);
});

test("more exit rows than exits clamps at zero rather than going negative", () => {
  // The table is append-only, so a correction is a second row about one
  // subject. Arithmetic must not leak into the reading.
  const f = readFunnel(
    stages({ lead: { open: 0, advanced: 0, exited: 1 } }),
    [
      { stage: "lead", reasonCode: "not_a_fit" },
      { stage: "lead", reasonCode: "timing" },
    ],
  );
  assert.equal(f.stages.find(at("lead"))!.unexplained, 0);
});
