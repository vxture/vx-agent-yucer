import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles, type RoleCode } from "../../authz/catalog";
import { unwrap } from "../shared/result";
import { InMemoryFieldStore } from "./field-store";
import {
  captureAdoption,
  closeCommitment,
  createCommitment,
  listCommitments,
  recordInteraction,
  relationshipEvidence,
  type FieldContext,
} from "./field-service";
import { daysSinceLastContact, isOverdue, reliability } from "./lib/commitment";

// The evidence plane's rules.
//
// The one that carries the design: a commitment cannot be closed by assertion.
// Everything else here exists to make sure that rule cannot be walked around.

const WS = "ws_1";
const ACC = "acc_1";
const NOW = new Date("2026-08-16T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function ctx(role: RoleCode, tier: Entitlement["tier"], store = new InMemoryFieldStore()): FieldContext {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles([role])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

async function openCommitment(c: FieldContext, over: Partial<Parameters<typeof createCommitment>[1]> = {}) {
  return unwrap(
    await createCommitment(c, {
      accountId: ACC,
      direction: "they_owe",
      statement: "return the signed order form",
      dueAt: days(3),
      ...over,
    }),
  );
}

// --- The rule ---------------------------------------------------------------

test("a commitment cannot be met by saying it was", async () => {
  // The whole reason this table exists rather than a task list. The person who
  // owes the promise is the person who would tick the box.
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  const cmt = await openCommitment(c);

  const r = await closeCommitment(c, cmt.id, { to: "met" });
  assert.equal(r.ok === false && r.violations[0].code, "evidence_required");
  assert.equal((await store.getCommitment(WS, cmt.id))?.status, "open", "nothing moved");
});

test("a commitment closes when something actually happened", async () => {
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  const cmt = await openCommitment(c);
  const interaction = unwrap(
    await recordInteraction(c, {
      accountId: ACC,
      channel: "meeting",
      occurredAt: days(-1),
      rawNote: "they handed over the signed form",
    }),
  );

  const closed = unwrap(
    await closeCommitment(c, cmt.id, { to: "met", evidence: { kind: "interaction", id: interaction.id }, at: NOW }),
  );
  assert.equal(closed.status, "met");
  assert.equal(closed.closureEvidenceId, interaction.id);
  assert.deepEqual(closed.metAt, NOW);
});

test("missing needs nothing - failure is what happens when nothing does", async () => {
  // Deliberately asymmetric with `met`. If a miss also needed evidence, the
  // most predictive signal in the table would require someone to volunteer bad
  // news about themselves.
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  const cmt = await openCommitment(c, { dueAt: days(-2) });

  const missed = unwrap(await closeCommitment(c, cmt.id, { to: "missed", at: NOW }));
  assert.equal(missed.status, "missed");
});

test("a promise cannot be missed before it is due", async () => {
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  const cmt = await openCommitment(c, { dueAt: days(5) });
  const r = await closeCommitment(c, cmt.id, { to: "missed", at: NOW });
  assert.equal(r.ok === false && r.violations[0].code, "not_yet_due");
});

test("a missed promise can still be kept, and the miss stays on the record", async () => {
  // A customer who delivers late has still been late. Rewriting that as though
  // it never happened erases exactly the signal worth keeping.
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  const cmt = await openCommitment(c, { dueAt: days(-4) });
  unwrap(await closeCommitment(c, cmt.id, { to: "missed", at: NOW }));

  const interaction = unwrap(
    await recordInteraction(c, { accountId: ACC, channel: "email", occurredAt: NOW, rawNote: "form arrived" }),
  );
  const met = unwrap(
    await closeCommitment(c, cmt.id, { to: "met", evidence: { kind: "interaction", id: interaction.id }, at: NOW }),
  );
  assert.equal(met.status, "met");
});

test("met and waived are terminal", async () => {
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  const cmt = await openCommitment(c);
  const i = unwrap(
    await recordInteraction(c, { accountId: ACC, channel: "call", occurredAt: NOW, rawNote: "done" }),
  );
  unwrap(await closeCommitment(c, cmt.id, { to: "met", evidence: { kind: "interaction", id: i.id }, at: NOW }));

  const again = await closeCommitment(c, cmt.id, { to: "missed", at: NOW });
  assert.equal(again.ok === false && again.violations[0].code, "illegal_transition");
});

test("waiving names who did it and why, and the name comes from the session", async () => {
  // A caller that could name the waiver could sign off someone else's decision
  // to let a promise go.
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  const cmt = await openCommitment(c);

  const noReason = await closeCommitment(c, cmt.id, { to: "waived" });
  assert.equal(noReason.ok === false && noReason.violations[0].code, "reason_required");

  const waived = unwrap(
    await closeCommitment(c, cmt.id, { to: "waived", waiveReason: "customer changed the process" }),
  );
  assert.equal(waived.waivedBySub, "usr_me");
  assert.equal(waived.waiveReason, "customer changed the process");
});

// --- Recording ---------------------------------------------------------------

test("an interaction cannot have happened later than now", async () => {
  // A meeting logged for next week would reset "last contact" to a date on
  // which nothing has happened - which is precisely the lie this plane exists
  // to stop telling.
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  const r = await recordInteraction(c, {
    accountId: ACC,
    channel: "meeting",
    occurredAt: new Date(Date.now() + 7 * 86_400_000),
    rawNote: "next week's meeting",
  });
  assert.equal(r.ok === false && r.violations[0].code, "occurred_in_future");
});

test("an interaction with no note is refused", async () => {
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  const r = await recordInteraction(c, {
    accountId: ACC,
    channel: "call",
    occurredAt: NOW,
    rawNote: "   ",
  });
  assert.equal(r.ok === false && r.violations[0].code, "note_required");
});

test("the recorder is a participant by default", async () => {
  // Recording a meeting you were not at is a different act, and it needs an
  // explicit participant list rather than a silent assumption.
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  const i = unwrap(
    await recordInteraction(c, { accountId: ACC, channel: "visit", occurredAt: NOW, rawNote: "site visit" }),
  );
  const parts = await store.listParticipants(WS, i.id);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].memberSub, "usr_me");
});

test("an unknown attendee is recordable before they are a contact", async () => {
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  const i = unwrap(
    await recordInteraction(c, {
      accountId: ACC,
      channel: "meeting",
      occurredAt: NOW,
      rawNote: "a VP joined unannounced",
      participants: [{ memberSub: "usr_me" }, { externalName: "unnamed VP", roleAtTime: "economic" }],
    }),
  );
  const parts = await store.listParticipants(WS, i.id);
  assert.equal(parts.length, 2);
  assert.ok(parts.some((p) => p.externalName === "unnamed VP"));
});

// --- Both gates --------------------------------------------------------------

test("recording needs the account write permission", async () => {
  const store = new InMemoryFieldStore();
  const r = await recordInteraction(ctx("viewer", "enterprise", store), {
    accountId: ACC,
    channel: "call",
    occurredAt: NOW,
    rawNote: "x",
  });
  assert.equal(r.ok, false);
  assert.equal((await store.listInteractions(WS)).length, 0, "nothing was written");
});

test("an unentitled workspace cannot read the evidence plane", async () => {
  const store = new InMemoryFieldStore();
  const r = await listCommitments(ctx("sales_rep", null, store));
  assert.equal(r.ok, false);
});

test("evidence never crosses a workspace boundary", async () => {
  const store = new InMemoryFieldStore();
  const mine = ctx("sales_rep", "free", store);
  await openCommitment(mine);

  const other = { ...mine, workspaceId: "ws_other" };
  assert.deepEqual(unwrap(await listCommitments(other)), []);
});

// --- What it tells you -------------------------------------------------------

test("the overdue list is a work queue, oldest broken promise first", async () => {
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  await openCommitment(c, { statement: "b", dueAt: days(-1) });
  await openCommitment(c, { statement: "a", dueAt: days(-9) });
  await openCommitment(c, { statement: "future", dueAt: days(4) });

  const overdue = unwrap(await listCommitments(c, { overdueAt: NOW }));
  assert.deepEqual(overdue.map((x) => x.statement), ["a", "b"], "future one excluded, oldest first");
});

test("reliability counts, and does not score", async () => {
  // "They have missed two of the three things they promised" is actionable.
  // A number between 0 and 100 is not.
  const r = reliability(
    [
      { status: "missed", direction: "they_owe", dueAt: days(-5) },
      { status: "met", direction: "they_owe", dueAt: days(-4) },
      { status: "open", direction: "they_owe", dueAt: days(-1) },
      { status: "open", direction: "we_owe", dueAt: days(-2) },
      { status: "open", direction: "we_owe", dueAt: days(6) },
    ],
    NOW,
  );
  assert.equal(r.theyMissed, 2, "one recorded miss plus one silently overdue");
  assert.equal(r.weMissed, 1);
  // 2, not 3: the already-recorded miss is RESOLVED, not overdue. Overdue means
  // open and past due - a promise nobody has yet faced.
  assert.equal(r.overdue, 2);
  assert.equal(r.theirKeptRate, 0.5);
});

test("a relationship with no history is not a perfect one", async () => {
  // The reason theirKeptRate is null rather than 1.
  assert.equal(reliability([], NOW).theirKeptRate, null);
  assert.equal(reliability([{ status: "open", direction: "they_owe", dueAt: days(5) }], NOW).theirKeptRate, null);
});

test("relationshipEvidence replaces the stage-move proxy with a real date", async () => {
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  unwrap(await recordInteraction(c, { accountId: ACC, channel: "call", occurredAt: days(-9), rawNote: "first" }));
  unwrap(await recordInteraction(c, { accountId: ACC, channel: "meeting", occurredAt: days(-2), rawNote: "recent" }));
  await openCommitment(c, { dueAt: days(-3) });

  const ev = unwrap(await relationshipEvidence(c, ACC, NOW));
  assert.deepEqual(ev.lastContactAt, days(-2), "the most recent contact, not the first");
  assert.equal(ev.interactionCount, 2);
  assert.equal(ev.reliability.overdue, 1);
});

test("no contact at all is null, which is not the same as contacted long ago", async () => {
  const store = new InMemoryFieldStore();
  const c = ctx("sales_rep", "free", store);
  const ev = unwrap(await relationshipEvidence(c, ACC, NOW));
  assert.equal(ev.lastContactAt, null);
  assert.equal(daysSinceLastContact([], NOW), null);
  assert.equal(daysSinceLastContact([days(-30)], NOW), 30);
});

test("overdue is open-and-past-due, and the definition is shared", async () => {
  // The sweep, the list and the UI must agree on this or they will disagree
  // about which promises are broken.
  assert.equal(isOverdue({ status: "open", dueAt: days(-1) }, NOW), true);
  assert.equal(isOverdue({ status: "open", dueAt: days(1) }, NOW), false);
  assert.equal(isOverdue({ status: "missed", dueAt: days(-1) }, NOW), false, "already resolved");
  assert.equal(isOverdue({ status: "met", dueAt: days(-1) }, NOW), false);
});

// --- The adoption reading (ADR-012's kill criterion) -------------------------

test("adoption is admin-gated, not a sales capability", async () => {
  // A rep must not be able to read whether their team is being measured, and a
  // capability tier must not be able to withhold the answer - withholding it
  // would mean the workspaces least likely to be using the product are the
  // least likely to be told so.
  const rep = ctx("sales_rep", "enterprise");
  const denied = await captureAdoption(rep, []);
  assert.equal(denied.ok, false);

  const admin = ctx("sales_leader", "free");
  const allowed = await captureAdoption(admin, []);
  assert.equal(allowed.ok, true, "no feature key gates it, so the free tier still gets an answer");
});

test("adoption counts deal-linked follow-ups only, and names the dark deals", async () => {
  const store = new InMemoryFieldStore();
  const c = ctx("sales_leader", "enterprise", store);

  const opps = [
    { id: "o_live", createdAt: days(-90), closedAt: null },
    { id: "o_dark", createdAt: days(-90), closedAt: null },
  ];

  // One note on the deal, one on the account only. The account-level note must
  // not rescue o_dark, and must not count towards the week at all.
  await recordInteraction(c, {
    accountId: ACC,
    opportunityId: "o_live",
    channel: "call",
    occurredAt: days(-2),
    rawNote: "spoke to them",
  });
  await recordInteraction(c, {
    accountId: ACC,
    channel: "call",
    occurredAt: days(-2),
    rawNote: "general catch-up, not about a deal",
  });

  const r = unwrap(await captureAdoption(c, opps, { now: NOW }));
  assert.deepEqual(r.touched, ["o_live"], "the account-level note touched no deal");

  const thisWeek = r.weeks[r.weeks.length - 1];
  assert.equal(thisWeek.opportunities, 2);
  assert.equal(thisWeek.covered, 1);
  assert.equal(thisWeek.interactions, 1, "the account-level note is not counted");
});

test("adoption withholds a verdict rather than failing early on a short window", async () => {
  const store = new InMemoryFieldStore();
  const c = ctx("sales_leader", "enterprise", store);
  const opps = [{ id: "o1", createdAt: days(-90), closedAt: null }];

  // Two weeks of nothing recorded. It must read as too_early, not not_adopted:
  // a criterion that can fail early is one that gets quoted early.
  const r = unwrap(await captureAdoption(c, opps, { now: NOW, weeks: 2 }));
  assert.equal(r.assessment.verdict, "too_early");
});

// --- The adoption path, exercised the way the page exercises it -------------
//
// Every defect the self-review found in the capture metric was invisible to the
// existing tests for one reason: they called the pure function with arguments
// the page never supplies. These call captureAdoption the way
// (app)/admin/adoption/page.tsx does - options.now only - so a defect in the
// wiring cannot hide behind a correct function.

test("a day-one workspace is never told the stage-2 kill verdict", async () => {
  // The reproduction. Open deals that predate the evidence plane, one call
  // recorded yesterday. Before the fix this read `not_adopted` - the kill
  // verdict - three days into use, because the too_early guard tested the
  // length of an array the caller controls.
  const store = new InMemoryFieldStore();
  const c = ctx("sales_leader", "enterprise", store);
  const opps = [
    { id: "o1", createdAt: days(-120), closedAt: null },
    { id: "o2", createdAt: days(-120), closedAt: null },
    { id: "o3", createdAt: days(-120), closedAt: null },
    { id: "o4", createdAt: days(-120), closedAt: null },
  ];
  await recordInteraction(c, {
    accountId: ACC,
    opportunityId: "o1",
    channel: "call",
    occurredAt: days(-1),
    rawNote: "spoke to them",
  });

  const r = unwrap(await captureAdoption(c, opps, { now: NOW }));
  assert.equal(r.assessment.verdict, "too_early");
  assert.equal(r.assessment.observedWeeks, 0, "observed for less than a week");
});

test("nothing recorded at all is too_early, not a failure", async () => {
  // What EVERY workspace looks like the day the evidence plane ships.
  const store = new InMemoryFieldStore();
  const c = ctx("sales_leader", "enterprise", store);
  const r = unwrap(
    await captureAdoption(c, [{ id: "o1", createdAt: days(-120), closedAt: null }], { now: NOW }),
  );
  assert.equal(r.assessment.verdict, "too_early");
  assert.equal(r.assessment.observedWeeks, null);
});

test("the verdict does not move when a week rolls over", async () => {
  // Identical data, four hours apart across a Monday boundary. Before the fix
  // the new week's empty partial counted at full weight and flipped the
  // verdict. A criterion that changes at midnight is not a criterion.
  const store = new InMemoryFieldStore();
  const c = ctx("sales_leader", "enterprise", store);
  const opps = [{ id: "o1", createdAt: days(-200), closedAt: null }];

  // Touched every week for ten weeks.
  for (let w = 0; w < 10; w += 1) {
    await recordInteraction(c, {
      accountId: ACC,
      opportunityId: "o1",
      channel: "call",
      occurredAt: days(-3 - w * 7),
      rawNote: `week ${w}`,
    });
  }

  // NOW is a Sunday 00:00 UTC; +1 day crosses into the next week.
  const before = unwrap(await captureAdoption(c, opps, { now: NOW }));
  const after = unwrap(await captureAdoption(c, opps, { now: days(1) }));
  assert.equal(before.assessment.verdict, after.assessment.verdict);
  assert.equal(before.assessment.judgedCoverage, after.assessment.judgedCoverage);
});

test("closing an untouched deal does not retroactively improve past weeks", async () => {
  // The page's denominator must be historical. This is the assertion the old
  // test made against the pure function while the page passed only open deals,
  // so the product had the defect the suite claimed to forbid.
  const store = new InMemoryFieldStore();
  const c = ctx("sales_leader", "enterprise", store);
  await recordInteraction(c, {
    accountId: ACC,
    opportunityId: "kept",
    channel: "call",
    occurredAt: days(-10),
    rawNote: "one touch",
  });

  const bothOpen = [
    { id: "kept", createdAt: days(-200), closedAt: null },
    { id: "dark", createdAt: days(-200), closedAt: null },
  ];
  const darkClosed = [
    { id: "kept", createdAt: days(-200), closedAt: null },
    // Closed AFTER the week in question, so that week's denominator is unchanged.
    { id: "dark", createdAt: days(-200), closedAt: days(-1) },
  ];

  const a = unwrap(await captureAdoption(c, bothOpen, { now: NOW }));
  const b = unwrap(await captureAdoption(c, darkClosed, { now: NOW }));
  const weekOf = (r: typeof a, days: number) =>
    r.weeks.find((w) => w.weekStart.getTime() <= NOW.getTime() - days * 86_400_000 &&
      w.weekEnd.getTime() > NOW.getTime() - days * 86_400_000);
  assert.equal(weekOf(a, 10)?.coverage, weekOf(b, 10)?.coverage, "the past week is unchanged");
});
