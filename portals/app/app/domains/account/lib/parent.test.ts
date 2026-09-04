import { test } from "node:test";
import assert from "node:assert/strict";
import { planAccountParent, type KnownAccount } from "./parent";

// WHAT IS WORTH TESTING HERE is only the half the database cannot do.
// chk_account_parent_not_self catches a row that is its own parent and the
// foreign key catches a parent that does not exist; both are covered below
// anyway, because the rule refuses them by NAME and a constraint refuses them
// by constraint name, and the difference is the whole reason this file exists.
//
// The part with no database equivalent is the chain. A->B->A is legal to
// Postgres - a foreign key sees one row at a time - so every cycle test here is
// testing something nothing else in the stack can.

const a = (id: string, parentId: string | null = null): KnownAccount => ({ id, parentId });

test("detaching is always allowed, and is not asked to justify itself", () => {
  // No lookups, no existence checks: a subsidiary that was sold is a fact, and
  // a rule that made recording it conditional would make the product wrong
  // about the world. Note `existing` is EMPTY - detaching does not even need
  // the account to be findable.
  const r = planAccountParent({ accountId: "acc_1", parentId: null }, []);
  assert.equal(r.ok, true);
});

test("a customer cannot be its own parent", () => {
  const r = planAccountParent({ accountId: "acc_1", parentId: "acc_1" }, [a("acc_1")]);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0]!.code, "parent_self");
});

test("a parent that does not exist is refused by name, not by a foreign key", () => {
  // The FK would refuse this too - at write time, with a constraint name that
  // no caller can act on and no message a person can read.
  const r = planAccountParent({ accountId: "acc_1", parentId: "acc_ghost" }, [a("acc_1")]);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0]!.code, "parent_not_found");
  assert.equal(r.ok === false && r.violations[0]!.field, "parentId");
});

test("reparenting an account that is not on file is refused", () => {
  const r = planAccountParent({ accountId: "acc_ghost", parentId: "acc_1" }, [a("acc_1")]);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0]!.code, "not_found");
});

test("an ordinary parent link is allowed", () => {
  const r = planAccountParent({ accountId: "acc_2", parentId: "acc_1" }, [a("acc_1"), a("acc_2")]);
  assert.equal(r.ok, true);
});

test("a two-step cycle is refused - the case no constraint can see", () => {
  // acc_1 already reports to acc_2. Making acc_2 report to acc_1 closes the
  // loop, and every reader of the hierarchy would then walk forever.
  const existing = [a("acc_1", "acc_2"), a("acc_2")];
  const r = planAccountParent({ accountId: "acc_2", parentId: "acc_1" }, existing);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0]!.code, "parent_cycle");
});

test("a longer cycle is refused too - the walk is not depth-one", () => {
  // acc_1 -> acc_2 -> acc_3. Pointing acc_3 at acc_1 closes a three-link loop,
  // and a guard that only looked at the immediate parent would allow it.
  const existing = [a("acc_1", "acc_2"), a("acc_2", "acc_3"), a("acc_3")];
  const r = planAccountParent({ accountId: "acc_3", parentId: "acc_1" }, existing);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.violations[0]!.code, "parent_cycle");
});

test("a shared ancestor is not a cycle - two subsidiaries of one group", () => {
  // The case a naive "have I seen this id" guard gets wrong. acc_2 and acc_3
  // both under acc_1 is the ordinary shape of a group, not a loop.
  const existing = [a("acc_1"), a("acc_2", "acc_1"), a("acc_3")];
  const r = planAccountParent({ accountId: "acc_3", parentId: "acc_1" }, existing);
  assert.equal(r.ok, true);
});

test("a deeper legal chain is allowed - depth alone is not the objection", () => {
  const existing = [a("acc_1"), a("acc_2", "acc_1"), a("acc_3", "acc_2"), a("acc_4")];
  const r = planAccountParent({ accountId: "acc_4", parentId: "acc_3" }, existing);
  assert.equal(r.ok, true);
});

test("the walk terminates on data that is ALREADY cyclic", () => {
  // The guard cannot assume the hierarchy it reads is sound. A direct write, a
  // data correction, or a restore could leave acc_1 <-> acc_2 pointing at each
  // other; the walk must then still answer rather than hang. This test is the
  // reason `seen` exists in reaches(), and without it the process spins.
  const corrupt = [a("acc_1", "acc_2"), a("acc_2", "acc_1"), a("acc_3")];
  const r = planAccountParent({ accountId: "acc_3", parentId: "acc_1" }, corrupt);
  // acc_3 is not in that loop, so the answer is "allowed" - what matters is
  // that there IS an answer.
  assert.equal(r.ok, true);
});
