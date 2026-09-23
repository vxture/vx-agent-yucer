import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contractPhase,
  daysToTermEnd,
  noticeDeadline,
  ownedProducts,
  planContract,
  planContractLine,
  type ContractDraft,
  type ContractFacts,
} from "./contract";

const NOW = new Date("2026-09-22T08:00:00Z");
const day = (s: string) => new Date(`${s}T00:00:00Z`);

function draft(over: Partial<ContractDraft> = {}): ContractDraft {
  return {
    contractNo: "HT-1",
    name: "Annual subscription",
    accountId: "acc_1",
    opportunityId: "opp_1",
    totalAmount: 100_000,
    currency: "CNY",
    termStart: day("2026-01-01"),
    termEnd: day("2026-12-31"),
    noticeDays: 30,
    status: "active",
    signedAt: null,
    ...over,
  };
}

function facts(over: Partial<ContractFacts> = {}): ContractFacts {
  return {
    id: "ct_1",
    contractNo: "HT-1",
    accountId: "acc_1",
    opportunityId: "opp_1",
    status: "active",
    currency: "CNY",
    termStart: day("2026-01-01"),
    termEnd: day("2026-12-31"),
    ...over,
  };
}

const codes = (r: { ok: boolean; violations?: Array<{ code: string }> }) =>
  r.ok ? [] : (r as { violations: Array<{ code: string }> }).violations.map((v) => v.code);

test("a well-formed contract passes, trimmed", () => {
  const r = planContract(draft({ contractNo: "  HT-1 ", name: " Annual " }), null);
  assert.ok(r.ok);
  assert.equal(r.ok && r.value.contractNo, "HT-1");
  assert.equal(r.ok && r.value.name, "Annual");
});

test("every field failure is reported at once, not only the first", () => {
  const r = planContract(
    draft({ contractNo: "", name: "", noticeDays: 400, totalAmount: -1, termEnd: day("2025-01-01") }),
    null,
  );
  assert.deepEqual(codes(r).sort(), [
    "amount_negative",
    "contract_no_required",
    "name_required",
    "notice_out_of_range",
    "term_inverted",
  ]);
});

test("an active contract without an end date is refused; a draft may leave it blank", () => {
  assert.deepEqual(codes(planContract(draft({ termEnd: null }), null)), ["term_required"]);
  assert.ok(planContract(draft({ status: "draft", termStart: null, termEnd: null }), null).ok);
});

test("an edit cannot move the frozen keys", () => {
  const held = facts();
  assert.deepEqual(codes(planContract(draft({ contractNo: "HT-2" }), held)), ["frozen_field"]);
  assert.deepEqual(codes(planContract(draft({ accountId: "acc_2" }), held)), ["frozen_field"]);
  assert.deepEqual(codes(planContract(draft({ opportunityId: null }), held)), ["frozen_field"]);
});

test("terminated is final, and active does not go back to draft", () => {
  assert.deepEqual(
    codes(planContract(draft({ status: "active" }), facts({ status: "terminated" }))),
    ["illegal_transition"],
  );
  assert.deepEqual(codes(planContract(draft({ status: "draft" }), facts())), ["illegal_transition"]);
  assert.ok(planContract(draft({ status: "terminated" }), facts()).ok);
});

test("a line's amount is computed in minor units and takes the contract's currency", () => {
  const r = planContractLine({ productId: "p1", quantity: 3, unitPrice: 33.33, termEnd: null }, facts({ currency: "USD" }));
  assert.ok(r.ok);
  assert.equal(r.ok && r.value.amount, 99.99);
  assert.equal(r.ok && r.value.currency, "USD");
});

test("a line refuses zero quantity, a negative price and outliving its contract", () => {
  assert.deepEqual(
    codes(planContractLine({ productId: "p1", quantity: 0, unitPrice: -1, termEnd: day("2027-06-30") }, facts())).sort(),
    ["amount_negative", "line_outside_term", "quantity_not_positive"],
  );
  assert.deepEqual(
    codes(planContractLine({ productId: "p1", quantity: 1, unitPrice: 1, termEnd: day("2025-06-30") }, facts())),
    ["line_outside_term"],
  );
});

test("a line cannot change product, and a terminated contract takes no lines", () => {
  const held = { id: "l1", productId: "p1", quantity: 1, termEnd: null };
  assert.deepEqual(
    codes(planContractLine({ productId: "p2", quantity: 1, unitPrice: 1, termEnd: null }, facts(), held)),
    ["frozen_field"],
  );
  assert.deepEqual(
    codes(planContractLine({ productId: "p1", quantity: 1, unitPrice: 1, termEnd: null }, facts({ status: "terminated" }))),
    ["contract_closed"],
  );
});

test("phase is derived from status and term, never stored", () => {
  assert.equal(contractPhase(facts({ status: "draft" }), NOW), "draft");
  assert.equal(contractPhase(facts({ status: "terminated" }), NOW), "terminated");
  assert.equal(contractPhase(facts(), NOW), "in_force");
  assert.equal(contractPhase(facts({ termEnd: day("2026-09-01") }), NOW), "lapsed");
  assert.equal(contractPhase(facts({ termStart: day("2026-10-01") }), NOW), "pending");
  // The end date is a calendar day: still in force for all of it.
  assert.equal(contractPhase(facts({ termEnd: day("2026-09-22") }), NOW), "in_force");
});

test("days to the end and the notice deadline", () => {
  assert.equal(daysToTermEnd(facts({ termEnd: day("2026-09-30") }), NOW), 8);
  assert.equal(daysToTermEnd(facts({ termEnd: null }), NOW), null);
  assert.deepEqual(noticeDeadline({ termEnd: day("2026-12-31"), noticeDays: 30 }), day("2026-12-01"));
  assert.equal(noticeDeadline({ termEnd: null, noticeDays: 30 }), null);
});

test("已购态 is the unexpired lines of in-force contracts, one row per product", () => {
  const owned = ownedProducts(
    [
      { ...facts({ id: "a" }), lines: [
        { id: "1", productId: "core", quantity: 1, termEnd: null },
        { id: "2", productId: "support", quantity: 1, termEnd: day("2026-06-30") }, // stopped early
      ] },
      { ...facts({ id: "b", termEnd: day("2027-03-31") }), lines: [
        { id: "3", productId: "core", quantity: 2, termEnd: null },
      ] },
      { ...facts({ id: "c", status: "terminated" }), lines: [
        { id: "4", productId: "analytics", quantity: 1, termEnd: null },
      ] },
      { ...facts({ id: "d", status: "draft" }), lines: [
        { id: "5", productId: "wms", quantity: 1, termEnd: null },
      ] },
      { ...facts({ id: "e", termEnd: day("2026-09-01") }), lines: [
        { id: "6", productId: "legacy", quantity: 1, termEnd: null },
      ] },
    ],
    NOW,
  );
  assert.deepEqual(owned, [
    { productId: "core", quantity: 3, runsUntil: day("2027-03-31"), contractIds: ["a", "b"] },
  ]);
});
