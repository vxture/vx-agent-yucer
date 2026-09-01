import { test } from "node:test";
import assert from "node:assert/strict";
import { canSeeRow, visibleRows } from "./visibility";
import { WHOLE_WORKSPACE, type DataScope } from "./scope";

const own: DataScope = { kind: "own", sub: "usr_me", accountIds: ["acc_mine"] };
const terr: DataScope = { kind: "territory", territoryIds: ["t_east", "t_shanghai"] };

// --- The default narrows nothing --------------------------------------------

test("an unscoped member sees every row, including ones with no owner", () => {
  for (const row of [
    { ownerSub: "usr_other", accountId: "acc_theirs", territoryId: "t_west" },
    { ownerSub: null },
  ]) {
    assert.equal(canSeeRow(WHOLE_WORKSPACE, row), true);
  }
});

// --- Ownership ---------------------------------------------------------------

test("own sees what is theirs and not what is not", () => {
  assert.equal(canSeeRow(own, { ownerSub: "usr_me", accountId: "acc_theirs" }), true);
  assert.equal(canSeeRow(own, { ownerSub: "usr_other", accountId: "acc_theirs" }), false);
});

test("own also sees rows hanging on a customer in their book", () => {
  // THE PARENT PATH, and the case that makes it necessary: a rep owns a deal on
  // an account somebody else owns. Without this their own deal's page could not
  // open the customer it is about - the scope would be enforcing
  // confidentiality against the person it described.
  assert.equal(canSeeRow(own, { ownerSub: "usr_other", accountId: "acc_mine" }), true);
});

test("a row on no customer is judged by ownership alone", () => {
  // An account is itself the parent, so it carries no accountId. Nothing to
  // inherit from means the owner path is the only one left.
  assert.equal(canSeeRow(own, { ownerSub: "usr_other" }), false);
  assert.equal(canSeeRow(own, { ownerSub: "usr_me" }), true);
});

// --- The queue ---------------------------------------------------------------

test("an unowned row is visible to everyone, at every scope", () => {
  // The owner's ruling of 2026-09-01, and the reason is operational: a lead
  // nobody owns that nobody can see is a lead nobody will ever claim. It holds
  // for every object rather than only leads - a row nobody owns is not somebody
  // else's private business.
  for (const scope of [own, terr]) {
    assert.equal(canSeeRow(scope, { ownerSub: null }), true);
    assert.equal(canSeeRow(scope, { ownerSub: null, territoryId: "t_west" }), true);
  }
});

// --- Territory ---------------------------------------------------------------

test("territory sees its own ground and not somebody else's", () => {
  assert.equal(canSeeRow(terr, { ownerSub: "usr_other", territoryId: "t_east" }), true);
  assert.equal(canSeeRow(terr, { ownerSub: "usr_other", territoryId: "t_west" }), false);
});

test("a territory-scoped member does not see a row filed under no territory", () => {
  // Unless nobody owns it - the queue rule above. An owned row with no
  // territory has an owner who can see it, and narrowing means somebody else
  // does not.
  assert.equal(canSeeRow(terr, { ownerSub: "usr_other", territoryId: null }), false);
  assert.equal(canSeeRow(terr, { ownerSub: "usr_other" }), false);
});

test("territory ignores ownership - covering the ground is the point", () => {
  // A regional director covers a region they own nothing in. Requiring
  // ownership as well would make the territory scope a strictly narrower `own`,
  // which is not a scope anybody asked for.
  assert.equal(canSeeRow(terr, { ownerSub: "usr_stranger", territoryId: "t_shanghai" }), true);
});

// --- The paths are a union ---------------------------------------------------

test("any route that reaches the row grants it, never both", () => {
  // Requiring two would make ordinary work invisible: a rep who owns a deal in
  // somebody else's region would lose their own deal.
  assert.equal(canSeeRow(own, { ownerSub: "usr_me", accountId: "acc_theirs", territoryId: "t_west" }), true);
});

// --- The list form -----------------------------------------------------------

test("filtering a list keeps order and drops only what is out of scope", () => {
  const rows = [
    { id: "a", ownerSub: "usr_me", accountId: null },
    { id: "b", ownerSub: "usr_other", accountId: "acc_theirs" },
    { id: "c", ownerSub: null, accountId: "acc_theirs" },
    { id: "d", ownerSub: "usr_other", accountId: "acc_mine" },
  ];
  assert.deepEqual(
    visibleRows(own, rows).map((r) => r.id),
    ["a", "c", "d"],
  );
  assert.equal(visibleRows(WHOLE_WORKSPACE, rows).length, 4);
});
