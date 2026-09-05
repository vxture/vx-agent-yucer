import { test } from "node:test";
import assert from "node:assert/strict";
import { chainForOpportunity, type ChainPerson, type OpportunityContactLink } from "./buying-role";
import { analyzeChain, type RelationEdge } from "./health";

// Resolving who is who ON ONE DEAL - the whole of batch D's rule layer.
//
// The graph walk in analyzeChain is not retested here: it did not change, and
// that is deliberate. Resolving roles BEFORE the walk is what let the walk stay
// exactly as it was, tested and correct. What is tested is that the resolution
// puts the right role on the right person - and the composition tests at the
// bottom prove it actually changes what analyzeChain concludes, because a
// resolver returning the right shape with the wrong roles would pass every
// assertion above them.
//
// THERE IS NO CUSTOMER-LEVEL ROLE to fall back to. A person has a name, a job
// title and a way to be reached; what they are to a purchase is a statement
// about that purchase.

const person = (id: string, status = "active"): ChainPerson => ({ id, status });

const link = (
  personId: string,
  buyingRole: OpportunityContactLink["buyingRole"],
  influence: number | null = null,
): OpportunityContactLink => ({ personId, buyingRole, influence });

test("a deal that has said nothing gives everybody `unknown`", () => {
  // AND THAT IS THE HONEST ANSWER, not a gap being hidden: analyzeChain treats
  // `unknown` as covering no role, so such a deal reports every required role
  // missing. It is true - nobody has said who signs. The old behaviour read a
  // role off the person and reported coverage this deal never established.
  const out = chainForOpportunity([person("a"), person("b")], []);
  assert.deepEqual(
    out.map((c) => c.decisionRole),
    ["unknown", "unknown"],
  );
  assert.deepEqual(
    out.map((c) => c.influence),
    [null, null],
  );
});

test("a stated role lands on that person and nobody else", () => {
  const out = chainForOpportunity([person("a"), person("b")], [link("a", "economic")]);
  assert.equal(out.find((c) => c.id === "a")!.decisionRole, "economic");
  assert.equal(out.find((c) => c.id === "b")!.decisionRole, "unknown");
});

test("status travels with the person, not the role", () => {
  // analyzeChain drops inactive people from coverage, so losing `status` here
  // would let a departed champion count as a covered role.
  const out = chainForOpportunity([person("a", "left")], [link("a", "coach")]);
  assert.equal(out[0]!.status, "left");
});

test("a link for somebody who is not at this customer adds nobody", () => {
  // The row is legal - a person can be named on a deal - but they are not in
  // this account's roster, and inventing a node would put somebody on a chain
  // the customer page never showed.
  const out = chainForOpportunity([person("a")], [link("ghost", "coach")]);
  assert.deepEqual(out.map((c) => c.id), ["a"]);
});

test("influence is per deal and absent means absent", () => {
  // Null is "no judgement on this deal", not zero. Coercing it would turn an
  // unanswered question into an answer - the same distinction the attainment
  // rules keep for an unset quota.
  assert.equal(chainForOpportunity([person("a")], [link("a", "economic", null)])[0]!.influence, null);
  assert.equal(chainForOpportunity([person("a")], [link("a", "economic", 20)])[0]!.influence, 20);
});

test("the input is not mutated", () => {
  // The caller holds one roster and resolves it against several deals. Mutating
  // in place would make the second deal's answer depend on the first.
  const people = [person("a")];
  chainForOpportunity(people, [link("a", "blocker")]);
  assert.deepEqual(people[0], { id: "a", status: "active" });
});

// --- the composition, which is what the product actually runs ---------------

test("two deals at one customer reach different verdicts", () => {
  // THE DEFECT ADR-024 OPENS WITH, as a test. One customer, one set of people,
  // one relationship graph - and two deals that disagree about who signs.
  // Before incr/0027 this was not expressible: the role was on the person, so
  // both deals got one answer and one badge.
  const people = [person("wang"), person("chen"), person("liu")];
  // A coach who can reach 陈昊 and NOT 王磊.
  const relations: RelationEdge[] = [
    { fromContactId: "liu", toContactId: "chen", relationType: "reports_to" },
  ];

  const supplyChain = analyzeChain(
    chainForOpportunity(people, [link("wang", "economic"), link("chen", "technical"), link("liu", "coach")]),
    relations,
  );
  const scheduling = analyzeChain(
    chainForOpportunity(people, [link("wang", "user"), link("chen", "economic"), link("liu", "coach")]),
    relations,
  );

  assert.equal(supplyChain.economicBuyerUnreachable, true, "no path from the coach to 王磊");
  assert.equal(scheduling.economicBuyerUnreachable, false, "the coach reports to 陈昊, who signs this one");
});

test("a deal nobody has staffed reports every required role missing", () => {
  // The end state of having no fallback, asserted rather than assumed. This is
  // the screen a new deal shows, and it is a true statement about that deal.
  const cov = analyzeChain(chainForOpportunity([person("a"), person("b")], []), []);
  assert.deepEqual(cov.missing, ["economic", "technical", "coach"]);
  assert.deepEqual(cov.covered, []);
  assert.equal(cov.economicBuyerUnreachable, true);
});
