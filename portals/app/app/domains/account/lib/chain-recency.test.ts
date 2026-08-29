import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHAIN_WARM_DAYS,
  type ContactNode,
  type RelationEdge,
  analyzeChain,
  analyzeChainRecency,
} from "./health";

// Recency over the decision chain.
//
// The property that carries this file: recency NEVER changes structural
// coverage. Capture adoption is short of complete, so "no recorded interaction"
// is not "no contact", and a recording gap must not be reported as a
// relationship gap.

const NOW = new Date("2026-08-16T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const c = (id: string, decisionRole: ContactNode["decisionRole"], status = "active"): ContactNode => ({
  id,
  decisionRole,
  influence: 50,
  status,
});

const CONTACTS = [c("coach", "coach"), c("econ", "economic"), c("tech", "technical")];
const EDGES: RelationEdge[] = [
  { fromContactId: "coach", toContactId: "econ", relationType: "reports_to" },
];

test("recency does not change what analyzeChain reports", () => {
  // The load-bearing separation. Same inputs, structural answer unchanged
  // whether or not anyone has recorded a thing.
  const structural = analyzeChain(CONTACTS, EDGES);
  assert.deepEqual(structural.missing, []);
  assert.equal(structural.economicBuyerUnreachable, false);

  // ...and with every contact stone cold, it is STILL unchanged.
  const cold = analyzeChainRecency(
    CONTACTS,
    EDGES,
    CONTACTS.map((x) => ({ contactId: x.id, lastContactAt: daysAgo(400) })),
    { now: NOW },
  );
  assert.equal(cold.warm.length, 0);
  assert.deepEqual(analyzeChain(CONTACTS, EDGES).missing, [], "coverage is untouched");
});

test("never-recorded is its own state, not a synonym for cold", () => {
  // A two-state design would fold these together and turn "nobody filled in the
  // form" into "this relationship has gone quiet".
  const r = analyzeChainRecency(
    CONTACTS,
    EDGES,
    [
      { contactId: "coach", lastContactAt: daysAgo(5) },
      { contactId: "econ", lastContactAt: daysAgo(400) },
      { contactId: "tech", lastContactAt: null },
    ],
    { now: NOW },
  );
  assert.deepEqual(r.warm.map((x) => x.id), ["coach"]);
  assert.deepEqual(r.cold.map((x) => x.id), ["econ"]);
  assert.deepEqual(r.unrecorded.map((x) => x.id), ["tech"]);
});

test("a contact absent from the activity list counts as unrecorded, not as fresh", () => {
  const r = analyzeChainRecency(CONTACTS, EDGES, [], { now: NOW });
  assert.equal(r.unrecorded.length, 3);
  assert.equal(r.warm.length, 0);
});

test("with nothing recorded at all, the warm path is null rather than false", () => {
  // Answering "no" would state a fact about the customer relationship on the
  // strength of a gap in our own record-keeping.
  const r = analyzeChainRecency(CONTACTS, EDGES, [], { now: NOW });
  assert.equal(r.warmPathToEconomic, null);
});

test("one recorded interaction anywhere makes the question answerable", () => {
  // And the answer is false here: the coach is warm but the economic buyer has
  // never been recorded, so there is no warm path.
  const r = analyzeChainRecency(
    CONTACTS,
    EDGES,
    [{ contactId: "coach", lastContactAt: daysAgo(1) }],
    { now: NOW },
  );
  assert.equal(r.warmPathToEconomic, false);
});

test("a warm coach reaching a warm economic buyer is a warm path", () => {
  const r = analyzeChainRecency(
    CONTACTS,
    EDGES,
    [
      { contactId: "coach", lastContactAt: daysAgo(3) },
      { contactId: "econ", lastContactAt: daysAgo(10) },
    ],
    { now: NOW },
  );
  assert.equal(r.warmPathToEconomic, true);
});

test("a path through a cold intermediary is not a warm path", () => {
  // coach -> bridge -> econ, all recorded, but the bridge went quiet. The
  // structural path still exists; the warm one does not, and that difference is
  // the entire point of computing this separately.
  const contacts = [c("coach", "coach"), c("bridge", "user"), c("econ", "economic")];
  const edges: RelationEdge[] = [
    { fromContactId: "coach", toContactId: "bridge", relationType: "peer_of" },
    { fromContactId: "bridge", toContactId: "econ", relationType: "reports_to" },
  ];
  assert.equal(analyzeChain(contacts, edges).economicBuyerUnreachable, false);

  const r = analyzeChainRecency(
    contacts,
    edges,
    [
      { contactId: "coach", lastContactAt: daysAgo(2) },
      { contactId: "bridge", lastContactAt: daysAgo(300) },
      { contactId: "econ", lastContactAt: daysAgo(2) },
    ],
    { now: NOW },
  );
  assert.equal(r.warmPathToEconomic, false);
});

test("an inactive contact is not warm however recently they were recorded", () => {
  // Someone who has left the company was still in a meeting last week. That is
  // history, not coverage - the same rule analyzeChain already applies.
  const contacts = [c("coach", "coach"), c("gone", "economic", "inactive")];
  const r = analyzeChainRecency(
    contacts,
    [{ fromContactId: "coach", toContactId: "gone", relationType: "reports_to" }],
    [
      { contactId: "coach", lastContactAt: daysAgo(1) },
      { contactId: "gone", lastContactAt: daysAgo(1) },
    ],
    { now: NOW },
  );
  assert.equal(r.warm.some((x) => x.id === "gone"), false);
  assert.equal(r.warmPathToEconomic, false);
});

test("the boundary is inclusive, so a contact exactly at the window is still warm", () => {
  const r = analyzeChainRecency(
    [c("coach", "coach")],
    [],
    [{ contactId: "coach", lastContactAt: daysAgo(CHAIN_WARM_DAYS) }],
    { now: NOW },
  );
  assert.equal(r.warm.length, 1, "exactly at the edge counts as inside");
  assert.equal(r.windowDays, CHAIN_WARM_DAYS);
});
