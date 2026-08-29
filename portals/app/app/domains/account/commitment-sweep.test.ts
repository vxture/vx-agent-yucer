import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryCopilotStore } from "../copilot/store";
import { type CommitmentRecord, InMemoryFieldStore } from "./field-store";
import { setCopilotStore, setFieldStore } from "../shared/registry";
import {
  SWEEP_ACTION_TYPE,
  SWEEP_PERMISSIONS,
  runCommitmentSweep,
} from "./commitment-sweep";

// The sweep.
//
// The property that carries this file: it CHANGES NO COMMITMENT. Everything
// else is bookkeeping around that.

const WS = [{ workspaceId: "ws_1" }];
const NOW = new Date("2026-08-16T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function commitment(over: Partial<CommitmentRecord> = {}): CommitmentRecord {
  return {
    id: "cm_1",
    workspaceId: "ws_1",
    accountId: "acc_1",
    opportunityId: null,
    originInteractionId: null,
    direction: "they_owe",
    statement: "return the signed order form",
    ownerSub: null,
    counterpartContactId: null,
    dueAt: daysAgo(10),
    status: "open",
    closureEvidenceKind: null,
    closureEvidenceId: null,
    metAt: null,
    waivedBySub: null,
    waiveReason: null,
    ...over,
  };
}

function setup(commitments: CommitmentRecord[]) {
  const field = new InMemoryFieldStore();
  field.seed({ commitments });
  const copilot = new InMemoryCopilotStore();
  setFieldStore(field);
  setCopilotStore(copilot);
  process.env.MOCK_TIER = "enterprise";
  return { field, copilot };
}

function teardown() {
  setFieldStore(null);
  setCopilotStore(null);
  delete process.env.MOCK_TIER;
}

test("the sweep proposes and changes nothing", async () => {
  // The whole design. Marking `missed` here would degrade the column from
  // "somebody observed this was not kept" to "the clock passed" - and it would
  // be a machine writing a verdict a customer gets confronted with.
  const { field, copilot } = setup([commitment()]);

  const led = await runCommitmentSweep({ workspaces: WS, now: NOW });
  assert.equal(led.overdue, 1);
  assert.equal(led.proposed, 1);

  const after = await field.getCommitment("ws_1", "cm_1");
  assert.equal(after?.status, "open", "the commitment is untouched");
  assert.equal(after?.metAt, null);
  assert.equal(after?.waivedBySub, null);

  const queued = await copilot.listProposals("ws_1", {});
  assert.equal(queued.length, 1);
  assert.equal(queued[0].status, "proposed", "it waits for a human");
  teardown();
});

test("a swept proposal carries no confidence", async () => {
  // Confidence is a model's report on its own output. A rule that fired on a
  // date comparison has none, and writing 100 would make a deterministic
  // derivation indistinguishable from a model that was very sure - in a queue
  // that sorts on the field.
  const { copilot } = setup([commitment()]);
  await runCommitmentSweep({ workspaces: WS, now: NOW });
  const [p] = await copilot.listProposals("ws_1", {});
  assert.equal(p.confidence, null);
  assert.equal(p.actionType, SWEEP_ACTION_TYPE);
  teardown();
});

test("the subject is one the database CHECK allows, with the commitment in the payload", async () => {
  // chk_agent_action_subject has no 'commitment' value. Widening it to avoid
  // writing a payload field would be spending an increment on nothing.
  const { copilot } = setup([
    commitment({ id: "cm_a" }),
    commitment({ id: "cm_b", opportunityId: "opp_1" }),
  ]);
  await runCommitmentSweep({ workspaces: WS, now: NOW });

  const props = await copilot.listProposals("ws_1", {});
  const bySubject = new Map(props.map((p) => [p.subjectType, p]));
  assert.ok(bySubject.has("account"), "no deal -> the customer");
  assert.ok(bySubject.has("opportunity"), "a deal -> the deal");
  assert.equal(bySubject.get("opportunity")?.subjectId, "opp_1");
  for (const p of props) {
    assert.equal(typeof (p.payload as { commitmentId?: unknown }).commitmentId, "string");
  }
  teardown();
});

test("running twice does not queue the same broken promise twice", async () => {
  // A daily sweep that re-proposed every morning would bury the queue in a
  // week, and a queue nobody can face is a queue nobody reads.
  const { copilot } = setup([commitment()]);
  const first = await runCommitmentSweep({ workspaces: WS, now: NOW });
  const second = await runCommitmentSweep({ workspaces: WS, now: NOW });

  assert.equal(first.proposed, 1);
  assert.equal(second.proposed, 0);
  assert.equal(second.alreadyQueued, 1);
  assert.equal((await copilot.listProposals("ws_1", {})).length, 1);
  teardown();
});

test("two overdue promises on one account are two decisions, not one", async () => {
  // Dedup is per commitment, not per subject. Collapsing them would silently
  // drop the second broken promise on a struggling account.
  const { copilot } = setup([
    commitment({ id: "cm_a", statement: "a" }),
    commitment({ id: "cm_b", statement: "b" }),
  ]);
  await runCommitmentSweep({ workspaces: WS, now: NOW });
  assert.equal((await copilot.listProposals("ws_1", {})).length, 2);
  teardown();
});

test("a promise that is not yet due is not swept", async () => {
  const { copilot } = setup([commitment({ dueAt: new Date(NOW.getTime() + 86_400_000) })]);
  const led = await runCommitmentSweep({ workspaces: WS, now: NOW });
  assert.equal(led.overdue, 0);
  assert.equal(led.proposed, 0);
  assert.equal((await copilot.listProposals("ws_1", {})).length, 0);
  teardown();
});

test("already-resolved promises are not swept, in any terminal state", async () => {
  const { copilot } = setup([
    commitment({ id: "cm_met", status: "met" }),
    commitment({ id: "cm_missed", status: "missed" }),
    commitment({ id: "cm_waived", status: "waived" }),
  ]);
  const led = await runCommitmentSweep({ workspaces: WS, now: NOW });
  assert.equal(led.overdue, 0, "overdue means OPEN and past due");
  assert.equal((await copilot.listProposals("ws_1", {})).length, 0);
  teardown();
});

test("our own broken promises are swept too, and the rationale says whose they are", async () => {
  // A sweep that only chased the customer would be a scoreboard.
  const { copilot } = setup([
    commitment({ id: "cm_them", direction: "they_owe" }),
    commitment({ id: "cm_us", direction: "we_owe", ownerSub: "usr_1" }),
  ]);
  await runCommitmentSweep({ workspaces: WS, now: NOW });
  const rationales = (await copilot.listProposals("ws_1", {})).map((p) => p.rationale ?? "");
  assert.equal(rationales.length, 2);
  assert.ok(rationales.some((r) => r.startsWith("They promised")));
  assert.ok(rationales.some((r) => r.startsWith("We promised")));
  teardown();
});

test("the sweep subject holds exactly one permission", async () => {
  // Borrowing a role would hand a background job everything a salesperson has.
  assert.deepEqual([...SWEEP_PERMISSIONS], ["copilot.use"]);
});

test("a workspace whose tier refuses proposals is skipped before any work", async () => {
  // ADR-010 rule 5. Not an error, not a silent success - and now also not
  // after the fact: the early return on "nothing overdue" used to sit ahead of
  // the gate, so an unentitled workspace with tidy commitments was counted as
  // neither skipped nor swept.
  const { copilot } = setup([commitment()]);
  process.env.MOCK_TIER = "free";
  const led = await runCommitmentSweep({ workspaces: WS, now: NOW });
  assert.equal(led.skipped, 1);
  assert.equal(led.proposed, 0);
  // Nothing was scanned either: the gate now runs before the work, so an
  // unentitled workspace does not have its commitment table read at all.
  assert.equal(led.overdue, 0);
  assert.equal((await copilot.listProposals("ws_1", {})).length, 0);
  teardown();
});

// --- TD-003: the race has a floor -------------------------------------------

test("the store refuses a second OPEN proposal for the same commitment", async () => {
  // The exact interleaving the read-then-write dedup cannot see: both writers
  // passed the read, both write. The second write must be absorbed, not
  // doubled and not an error.
  const { copilot } = setup([commitment()]);
  try {
    const first = await runCommitmentSweep({ workspaces: WS, now: NOW });
    assert.equal(first.proposed, 1);

    // Simulate the losing writer arriving after the read: file the same
    // commitment directly at the store, as the concurrent sweep would.
    const pending = await copilot.listProposals("ws_1", { status: "proposed" });
    const dup = await copilot.createProposals("ws_1", [
      {
        sessionId: null,
        actionType: "chase_overdue_commitment",
        subjectType: "account",
        subjectId: "acc_1",
        payload: { commitmentId: "cm_1" },
        rationale: "the race's second writer",
        confidence: null,
      },
    ]);
    assert.equal(dup.length, 0, "the floor must absorb the duplicate");
    const after = await copilot.listProposals("ws_1", { status: "proposed" });
    assert.equal(after.length, pending.length, "no second row may exist");
  } finally {
    teardown();
  }
});

test("a decided proposal does not block re-proposing - the WHERE clause is load-bearing", async () => {
  const { copilot } = setup([commitment()]);
  try {
    const first = await runCommitmentSweep({ workspaces: WS, now: NOW });
    assert.equal(first.proposed, 1);

    // A human rejects it. The promise is still broken, so tomorrow's sweep
    // must be able to raise it again - re-asking is what the sweep is FOR.
    const [p] = await copilot.listProposals("ws_1", { status: "proposed" });
    await copilot.applyDecision("ws_1", [
      {
        id: p.id,
        patch: { status: "rejected", decidedBySub: "usr_1", decidedAt: NOW },
        from: ["proposed"],
      },
    ]);

    const second = await runCommitmentSweep({ workspaces: WS, now: NOW });
    assert.equal(second.proposed, 1, "a rejected proposal must not block the re-ask");
  } finally {
    teardown();
  }
});

test("proposals without a commitmentId are unconstrained, like the index's NULLs", async () => {
  const { copilot } = setup([]);
  try {
    const mk = () => ({
      sessionId: null,
      actionType: "chase_overdue_commitment",
      subjectType: "account" as const,
      subjectId: "acc_1",
      payload: {},
      rationale: "no commitment key",
      confidence: null,
    });
    const a = await copilot.createProposals("ws_1", [mk()]);
    const b = await copilot.createProposals("ws_1", [mk()]);
    assert.equal(a.length + b.length, 2, "NULL keys are distinct; both must land");
  } finally {
    teardown();
  }
});
