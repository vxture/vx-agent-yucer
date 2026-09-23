import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAccountStatus, type AccountStatusFacts } from "./status";

const NOW = new Date("2026-09-23T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const facts = (over: Partial<AccountStatusFacts> = {}): AccountStatusFacts => ({
  signedContracts: 0,
  inForceContracts: 0,
  openDeals: 0,
  wonDealsClosedAt: [],
  runningProjects: 0,
  latestRenewalOutcome: null,
  ...over,
});

test("never bought is a prospect, even with a deal in play", () => {
  assert.equal(deriveAccountStatus(facts(), NOW), "prospect");
  assert.equal(deriveAccountStatus(facts({ openDeals: 2 }), NOW), "prospect");
});

test("a customer with anything live is active", () => {
  assert.equal(deriveAccountStatus(facts({ signedContracts: 1, inForceContracts: 1 }), NOW), "active");
  assert.equal(deriveAccountStatus(facts({ signedContracts: 1, openDeals: 1 }), NOW), "active");
  assert.equal(deriveAccountStatus(facts({ runningProjects: 1 }), NOW), "active");
  assert.equal(deriveAccountStatus(facts({ wonDealsClosedAt: [daysAgo(200)] }), NOW), "active");
});

test("a win older than a year with nothing live is dormant", () => {
  assert.equal(deriveAccountStatus(facts({ wonDealsClosedAt: [daysAgo(400)] }), NOW), "dormant");
  assert.equal(deriveAccountStatus(facts({ wonDealsClosedAt: [null] }), NOW), "dormant");
  assert.equal(deriveAccountStatus(facts({ signedContracts: 2 }), NOW), "dormant");
});

test("a lost renewal with nothing live is churned; a new deal in play keeps it active", () => {
  assert.equal(deriveAccountStatus(facts({ signedContracts: 1, latestRenewalOutcome: "lost" }), NOW), "churned");
  assert.equal(
    deriveAccountStatus(facts({ signedContracts: 1, latestRenewalOutcome: "lost", openDeals: 1 }), NOW),
    "active",
  );
  assert.equal(deriveAccountStatus(facts({ signedContracts: 1, latestRenewalOutcome: "downgraded" }), NOW), "dormant");
});
