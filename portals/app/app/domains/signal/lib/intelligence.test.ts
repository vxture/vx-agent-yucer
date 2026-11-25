import { test } from "node:test";
import assert from "node:assert/strict";
import { planSignalRegistration, signalSourceUrl, type SignalRegistration } from "./intelligence";
import { unwrap } from "../../shared/result";
const input: SignalRegistration = { requestId: "registration-0001", subject: "Platform subscription renewal", companyName: "Acme",
  summary: "A platform upgrade is budgeted for the next quarter.", signalType: "intent", detectedAt: "2026-11-20",
  sourceUrl: "https://example.com/procurement", amount: "120000", deadline: "2026-12-18" };
const now = new Date("2026-11-25T12:00:00Z");

test("registration records structured original evidence and never impersonates a feed", () => {
  const signal = unwrap(planSignalRegistration(input, now));
  assert.equal(signal.source, "manual");
  assert.equal(signal.sourceRef, input.requestId);
  assert.equal(signal.payload?.company_name, "Acme");
  assert.equal(signal.payload?.amount, 120000);
  assert.equal(signal.payload?.deadline, "2026-12-18");
  assert.equal(signalSourceUrl({ ...signal, payload: signal.payload ?? {} }), input.sourceUrl);
  assert.equal("score" in signal, false);
});
for (const patch of [{ subject: " " }, { subject: "x".repeat(256) }, { summary: "x".repeat(1201) },
  { companyName: "" }, { signalType: "invented" }, { amount: "NaN" }, { amount: "-1" },
  { deadline: "2026-02-30" }, { deadline: "2026-99-99" }, { detectedAt: "bad-date" }, { detectedAt: null },
  { detectedAt: "2027-01-01" }, { sourceUrl: "javascript:alert(1)" }, { sourceUrl: "https://user:secret@example.com/" },
]) test(`invalid evidence is refused before storage: ${JSON.stringify(patch).slice(0, 60)}`, () => {
  assert.equal(planSignalRegistration({ ...input, ...patch } as SignalRegistration, now).ok, false);
});
test("malformed or opaque source references are not executable links", () => {
  for (const sourceRef of ["not-a-url", "https://[broken", "javascript:alert(1)"]) assert.equal(signalSourceUrl({ sourceRef, payload: {} }), null);
  assert.equal(signalSourceUrl({ sourceRef: "opaque-source", payload: { source_url: "https://example.com/evidence" } }), "https://example.com/evidence");
});
