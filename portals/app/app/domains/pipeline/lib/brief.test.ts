import { test } from "node:test";
import assert from "node:assert/strict";
import { dealBrief, type BriefText, type DealBriefInput } from "./brief";

// The convergence point. Each underlying rule has its own tests; what is
// tested HERE is the convergence itself - that a finding becomes the right
// cell tone, that only justified findings become actions, that ranking puts
// the worst first, and that a healthy deal produces a quiet brief rather than
// invented urgency.

const NOW = new Date("2026-09-05T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

// Sentences as keys, so assertions read the CONTRACT and not Chinese copy.
const TEXT: BriefText = {
  stageMoving: (s, d) => `moving:${s}:${d}`,
  stageStalled: (s, d) => `stalled:${s}:${d}`,
  stageTerminal: (s) => `terminal:${s}`,
  forecastAgrees: (c) => `agrees:${c}`,
  forecastDisagrees: (f, s) => `disagrees:${f}->${s}`,
  forecastSettled: "settled",
  forecastWhy: (caps, p, h) => `why:${caps.join("+")}:${p}:${h}`,
  chainHealthy: (n) => `chain-ok:${n}`,
  chainMissing: (r) => `chain-missing:${r.join("+")}`,
  chainUnreachable: "chain-unreachable",
  chainUnstated: "chain-unstated",
  commitmentClear: (n) => `commit-ok:${n}`,
  commitmentOverdue: (o, t) => `commit-late:${o}:${t}`,
  priceClean: (n) => `price-ok:${n}`,
  pricePending: (n) => `price-pending:${n}`,
  settleReason: (d, days) => `settle:${d}:${days}`,
  applyCategoryReason: (b) => `apply:${b}`,
  approveReason: (n) => `approve:${n}`,
  stateRolesReason: "state-roles",
  adjudicateReason: (n) => `adjudicate:${n}`,
};

function input(over: Partial<DealBriefInput> = {}): DealBriefInput {
  return {
    deal: {
      id: "opp_1",
      stage: "validate",
      forecastCategory: "best_case",
      probability: null,
      expectedCloseAt: daysAhead(30),
      lastStageChangeAt: daysAgo(10),
      status: "open",
    },
    chain: {
      covered: ["economic", "technical", "coach"],
      missing: [],
      blockers: [],
      coaches: [{ id: "c", decisionRole: "coach", influence: 50, status: "active" }],
      economicBuyerUnreachable: false,
    },
    rolesStated: true,
    commitments: [],
    lines: [],
    proposals: [],
    text: TEXT,
    now: NOW,
    ...over,
  };
}

test("a healthy deal is five green cells and ZERO actions", () => {
  // The quiet brief is the contract that matters most: a war room that always
  // finds something to say trains people to stop reading it.
  const b = dealBrief(input());
  assert.equal(b.cells.length, 5);
  assert.deepEqual([...new Set(b.cells.map((c) => c.tone))], ["good"]);
  assert.deepEqual(b.actions, []);
});

test("a stall turns the stage cell bad, and the FORECAST reacts - not the stage", () => {
  // There is no legitimate one-click for "it sat too long" - advancing a stage
  // is a decision, not a fix - so no stage action exists. But the convergence
  // is visible here: the stall is one of suggestCategory's caps, so a deal
  // filed as best_case while sitting 60 days gets a category disagreement,
  // WITH the stall named in its basis. The first draft of this test asserted
  // "no actions at all" and the brief was right to refuse: a stalled deal's
  // honest forecast IS different.
  const b = dealBrief(input({ deal: { ...input().deal, lastStageChangeAt: daysAgo(60) } }));
  assert.equal(b.cells.find((c) => c.key === "stage")!.tone, "bad");
  assert.equal(b.cells.find((c) => c.key === "stage")!.headline, "stalled:validate:60");
  assert.equal(b.actions.length, 1);
  const act = b.actions[0]!;
  assert.equal(act.kind, "apply_category");
  assert.ok(act.reason.includes("stalled"), "the stall must be named as the basis");
});

test("a forecast self-contradiction yields the one-click the rule justifies", () => {
  // A human 35% on a deal filed best_case at validate: the rule's suggestion
  // diverges, and applying IT is something the product already lets a person
  // do deliberately (applySuggestedCategory) - so it is an action.
  const b = dealBrief(
    input({ deal: { ...input().deal, probability: 15, forecastCategory: "commit" } }),
  );
  const cell = b.cells.find((c) => c.key === "forecast")!;
  assert.equal(cell.tone, "warn");
  const act = b.actions.find((a) => a.kind === "apply_category");
  assert.ok(act, "the disagreement must carry its one-click");
  assert.ok(act!.reason.startsWith("apply:why:"), "and the reason must carry the rule's basis");
});

test("agreement is a green cell and no action - no rubber-stamp invitation", () => {
  const b = dealBrief(input({ deal: { ...input().deal, forecastCategory: "best_case" } }));
  assert.equal(b.cells.find((c) => c.key === "forecast")!.tone, "good");
  assert.ok(!b.actions.some((a) => a.kind === "apply_category"));
});

test("no roles stated on this deal is BAD, not merely missing", () => {
  // Since incr/0027 there is no customer-level fallback: unknown-everywhere is
  // a true statement about this deal, and the action is to go say who is who.
  const b = dealBrief(input({ rolesStated: false }));
  assert.equal(b.cells.find((c) => c.key === "chain")!.headline, "chain-unstated");
  assert.equal(b.actions.find((a) => a.kind === "state_roles")!.severity, "bad");
});

test("an unreachable buyer outranks missing roles", () => {
  const unreachable = dealBrief(
    input({
      chain: {
        covered: ["economic"],
        missing: ["coach"],
        blockers: [],
        coaches: [],
        economicBuyerUnreachable: true,
      },
    }),
  );
  assert.equal(unreachable.cells.find((c) => c.key === "chain")!.tone, "bad");
  assert.equal(unreachable.cells.find((c) => c.key === "chain")!.headline, "chain-unreachable");
});

test("OUR broken promise is bad; THEIRS is warn - and both become settleable", () => {
  const b = dealBrief(
    input({
      commitments: [
        { id: "c1", direction: "we_owe", status: "open", dueAt: daysAgo(3), statement: "send the plan" },
        { id: "c2", direction: "they_owe", status: "open", dueAt: daysAgo(8), statement: "confirm budget" },
        { id: "c3", direction: "we_owe", status: "met", dueAt: daysAgo(20), statement: "done already" },
      ],
    }),
  );
  assert.equal(b.cells.find((c) => c.key === "commitment")!.headline, "commit-late:1:1");
  const settles = b.actions.filter((a) => a.kind === "settle_commitment");
  assert.equal(settles.length, 2, "a met commitment must not resurface");
  const ours = settles.find((a) => a.kind === "settle_commitment" && a.commitmentId === "c1")!;
  assert.equal(ours.severity, "bad", "a promise WE broke is ours to fix and debits reliability");
});

test("below-floor lines pending approval become one approve action, counted", () => {
  const b = dealBrief(
    input({
      lines: [
        { needsApproval: true, approved: false },
        { needsApproval: true, approved: true },
        { needsApproval: false, approved: false },
        { needsApproval: true, approved: false },
      ],
    }),
  );
  assert.equal(b.cells.find((c) => c.key === "price")!.headline, "price-pending:2");
  const act = b.actions.find((a) => a.kind === "approve_discount");
  assert.equal(act && act.kind === "approve_discount" ? act.pendingLines : 0, 2);
});

test("queued proposals join the actions but never the strip", () => {
  // The strip is the RULES' verdict; proposals are the machine's findings.
  // They meet in the action list, where a person can adjudicate both.
  const b = dealBrief(input({ proposals: [{ id: "p1", title: "t" }] }));
  assert.equal(b.cells.length, 5);
  const act = b.actions.find((a) => a.kind === "adjudicate");
  assert.deepEqual(act && act.kind === "adjudicate" ? [...act.proposalIds] : [], ["p1"]);
});

test("ranking is worst-first across kinds", () => {
  const b = dealBrief(
    input({
      rolesStated: false, // bad
      lines: [{ needsApproval: true, approved: false }], // warn
      proposals: [{ id: "p1", title: "t" }], // warn
    }),
  );
  assert.equal(b.actions[0]!.severity, "bad");
  assert.ok(b.actions.slice(1).every((a) => a.severity === "warn"));
});

test("a terminal deal keeps its history quiet - no chain nag, no stall", () => {
  const b = dealBrief(
    input({
      deal: { ...input().deal, stage: "won", status: "won", lastStageChangeAt: daysAgo(200) },
      rolesStated: false,
    }),
  );
  assert.equal(b.cells.find((c) => c.key === "stage")!.headline, "terminal:won");
  assert.ok(!b.cells.some((c) => c.key === "chain"), "a closed deal owes no committee");
  assert.ok(!b.actions.some((a) => a.kind === "state_roles"));
});
