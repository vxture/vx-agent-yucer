import { test } from "node:test";
import assert from "node:assert/strict";
import { unwrap } from "../../shared/result";
import {
  HALF_LIFE_DAYS,
  MIN_DECAY,
  SIGNAL_STATUSES,
  SIGNAL_TYPES,
  TYPE_WEIGHT,
  assertEvidenceUnchanged,
  decayMultiplier,
  dedupKey,
  planPromotion,
  planRescore,
  planStatusChange,
  scoreSignal,
  type SignalSnapshot,
  type SignalStatus,
} from "./scoring";

const NOW = new Date("2026-08-15T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const score = (over: Parameters<typeof scoreSignal>[0] extends infer T ? Partial<T> : never = {}) =>
  unwrap(scoreSignal({ signalType: "intent", detectedAt: NOW, now: NOW, ...over }));

// --- Rule 1: an unknown company is the point, not a disqualification --------

test("an unmatched account does NOT zero the score", () => {
  // A scorer that zeroes strangers has quietly become a CRM report: the new-logo
  // signal is exactly what the detective domain exists to find.
  const unmatched = score({ accountId: null });
  assert.ok(unmatched.score > 0);
  assert.equal(unmatched.baseWeight, TYPE_WEIGHT.intent);
  assert.equal(unmatched.matchBonus, 0);
});

test("matching an account is a bonus on top, never a precondition", () => {
  const matched = score({ accountId: "acc_1", matchConfidence: 100 });
  const unmatched = score({ accountId: null });
  assert.ok(matched.score > unmatched.score);
  assert.equal(matched.score - unmatched.score, matched.matchBonus);
});

test("the match bonus scales with confidence, so a shaky match lifts less", () => {
  const sure = score({ accountId: "acc_1", matchConfidence: 100 });
  const shaky = score({ accountId: "acc_1", matchConfidence: 30 });
  assert.ok(sure.matchBonus > shaky.matchBonus);
  assert.ok(shaky.matchBonus > 0);
});

test("a matched signal with no stated confidence is treated as certain", () => {
  assert.equal(score({ accountId: "acc_1" }).matchBonus, score({ accountId: "acc_1", matchConfidence: 100 }).matchBonus);
});

// --- Rule 2: decay ----------------------------------------------------------

test("the score decays with age", () => {
  const fresh = score({ detectedAt: NOW });
  const old = score({ detectedAt: daysAgo(90) });
  assert.ok(old.score < fresh.score);
});

test("one half-life halves the weight", () => {
  assert.ok(Math.abs(decayMultiplier(HALF_LIFE_DAYS) - 0.5) < 1e-9);
  assert.ok(Math.abs(decayMultiplier(HALF_LIFE_DAYS * 2) - 0.25) < 1e-9);
  assert.equal(decayMultiplier(0), 1);
});

test("decay has a floor - old evidence loses weight but never becomes worthless", () => {
  // A long-lived pattern of weak signals from one account is itself a signal;
  // a multiplier reaching zero erases it.
  assert.equal(decayMultiplier(10_000), MIN_DECAY);
  assert.ok(score({ detectedAt: daysAgo(3650) }).score > 0);
});

test("future-dated evidence is treated as fresh, not rejected", () => {
  // Clock skew in an external feed must not throw away a real signal.
  const future = score({ detectedAt: new Date(NOW.getTime() + 86_400_000) });
  assert.equal(future.ageDays, 0);
  assert.equal(future.decayMultiplier, 1);
});

// --- Weights and bounds -----------------------------------------------------

test("every signal type has a weight and referral outranks engagement", () => {
  for (const t of SIGNAL_TYPES) assert.ok(TYPE_WEIGHT[t] > 0, t);
  assert.ok(TYPE_WEIGHT.referral > TYPE_WEIGHT.intent);
  assert.ok(TYPE_WEIGHT.intent > TYPE_WEIGHT.engagement);
  assert.ok(TYPE_WEIGHT.engagement > TYPE_WEIGHT.other);
});

test("the score always lands in 0-100", () => {
  for (const t of SIGNAL_TYPES) {
    for (const age of [0, 1, 30, 365, 3650]) {
      const s = score({ signalType: t, detectedAt: daysAgo(age), accountId: "a", matchConfidence: 100 });
      assert.ok(s.score >= 0 && s.score <= 100, `${t} at ${age}d -> ${s.score}`);
    }
  }
});

test("an out-of-range match confidence is clamped rather than distorting the score", () => {
  assert.equal(score({ accountId: "a", matchConfidence: 999 }).matchBonus, score({ accountId: "a", matchConfidence: 100 }).matchBonus);
  assert.equal(score({ accountId: "a", matchConfidence: -50 }).matchBonus, 0);
});

test("an unknown signal type is refused", () => {
  const r = scoreSignal({ signalType: "vibes" as never, detectedAt: NOW });
  assert.equal(r.ok === false && r.violations[0].code, "unknown_signal_type");
});

test("the breakdown explains the number, so a low score can be argued with", () => {
  const s = score({ signalType: "hiring", detectedAt: daysAgo(HALF_LIFE_DAYS), accountId: "a", matchConfidence: 100 });
  assert.equal(s.baseWeight, TYPE_WEIGHT.hiring);
  assert.ok(Math.abs(s.decayMultiplier - 0.5) < 1e-9);
  assert.equal(s.score, Math.round(TYPE_WEIGHT.hiring * 0.5) + s.matchBonus);
});

// --- Rule 3: evidence is frozen --------------------------------------------

test("evidence columns cannot be patched", () => {
  for (const key of ["source", "sourceRef", "signalType", "subject", "payload", "detectedAt"]) {
    const r = assertEvidenceUnchanged({ [key]: "x" });
    assert.equal(r.ok, false, key);
    assert.equal(r.ok === false && r.violations[0].code, "evidence_immutable");
    assert.match(r.ok === false ? r.violations[0].message : "", /fabricating/);
  }
});

test("the resolution columns stay writable - that is the whole point", () => {
  assert.ok(assertEvidenceUnchanged({ accountId: "acc_1", score: 82, status: "scored" }).ok);
});

test("snake_case column names are caught too", () => {
  assert.equal(assertEvidenceUnchanged({ source_ref: "x", detected_at: "y" }).ok, false);
});

// --- Dedup ------------------------------------------------------------------

test("the dedup key is workspace plus source plus source ref", () => {
  const k = dedupKey({ workspaceId: "ws", source: "news", sourceRef: "https://x/1" });
  assert.equal(k, "ws|news|https://x/1");
  assert.notEqual(k, dedupKey({ workspaceId: "ws2", source: "news", sourceRef: "https://x/1" }));
  assert.notEqual(k, dedupKey({ workspaceId: "ws", source: "web", sourceRef: "https://x/1" }));
});

test("a null source ref is stable rather than random", () => {
  assert.equal(
    dedupKey({ workspaceId: "ws", source: "manual", sourceRef: null }),
    dedupKey({ workspaceId: "ws", source: "manual", sourceRef: null }),
  );
});

// --- Lifecycle --------------------------------------------------------------

const sig = (over: Partial<SignalSnapshot> = {}): SignalSnapshot => ({
  status: "new",
  score: null,
  accountId: null,
  ...over,
});

test("scoring a new signal moves it to scored", () => {
  const patch = unwrap(planRescore(sig(), { score: 72 }));
  assert.equal(patch.status, "scored");
  assert.equal(patch.score, 72);
});

test("rescoring is allowed and repeatable - the score decays and models improve", () => {
  const patch = unwrap(planRescore(sig({ status: "scored", score: 80 }), { score: 61 }));
  assert.equal(patch.score, 61);
});

test("rescoring a promoted signal does not knock it back to scored", () => {
  // It already produced a lead; reverting the status would make it look eligible
  // for promotion a second time.
  const patch = unwrap(planRescore(sig({ status: "promoted", score: 80 }), { score: 70 }));
  assert.equal(patch.status, undefined);
  assert.equal(patch.score, 70);
});

test("a closed-out signal is not rescored", () => {
  for (const status of ["dismissed", "duplicate"] as SignalStatus[]) {
    const r = planRescore(sig({ status }), { score: 50 });
    assert.equal(r.ok === false && r.violations[0].code, "signal_closed", status);
  }
});

test("rescoring can attach or clear the matched account", () => {
  assert.equal(unwrap(planRescore(sig(), { score: 50 }, { accountId: "acc_1" })).accountId, "acc_1");
  assert.equal(unwrap(planRescore(sig({ accountId: "acc_1" }), { score: 50 }, { accountId: null })).accountId, null);
  // Omitted entirely = leave it alone.
  assert.equal("accountId" in unwrap(planRescore(sig(), { score: 50 })), false);
});

test("dismissed and duplicate are terminal", () => {
  for (const from of ["dismissed", "duplicate"] as SignalStatus[]) {
    for (const to of SIGNAL_STATUSES) {
      assert.equal(planStatusChange(sig({ status: from }), to).ok, false, `${from} -> ${to}`);
    }
  }
});

test("promotion requires a score", () => {
  // Promoting unscored means nobody judged whether it was worth anyone's time.
  const r = planStatusChange(sig({ status: "scored", score: null }), "promoted");
  assert.equal(r.ok === false && r.violations[0].code, "score_required");
  assert.ok(planStatusChange(sig({ status: "scored", score: 71 }), "promoted").ok);
});

test("a new signal cannot jump straight to promoted", () => {
  const r = planStatusChange(sig({ score: 80 }), "promoted");
  assert.equal(r.ok === false && r.violations[0].code, "illegal_transition");
});

test("an unknown status is refused", () => {
  const r = planStatusChange(sig(), "archived" as SignalStatus);
  assert.equal(r.ok === false && r.violations[0].code, "unknown_status");
});

// --- Promotion, the first link of the attribution chain ---------------------

const promotable = {
  id: "sig_1",
  status: "scored" as SignalStatus,
  score: 76,
  accountId: "acc_1",
  source: "web",
  sourceRef: "https://x/1",
  subject: "Acme Corp is migrating off its legacy CRM",
};

test("promotion produces the lead and the signal patch together", () => {
  const r = unwrap(planPromotion({ signal: promotable }));
  assert.equal(r.patch.status, "promoted");
  assert.equal(r.lead.signalId, "sig_1");
  assert.equal(r.lead.accountId, "acc_1");
  assert.equal(r.lead.score, 76);
  assert.equal(r.lead.status, "new");
});

test("a campaign-sourced signal passes its campaign to the lead", () => {
  const r = unwrap(planPromotion({ signal: { ...promotable, source: "campaign", sourceRef: "camp_7" } }));
  assert.equal(r.lead.campaignId, "camp_7");
});

test("a non-campaign signal must not invent a campaign lineage", () => {
  assert.equal(unwrap(planPromotion({ signal: promotable })).lead.campaignId, null);
});

test("the company name falls back to the signal subject, and can be overridden", () => {
  assert.equal(unwrap(planPromotion({ signal: promotable })).lead.companyName, promotable.subject);
  assert.equal(unwrap(planPromotion({ signal: promotable, companyName: "Acme Corp" })).lead.companyName, "Acme Corp");
});

test("promotion refuses when there is no company name to be had", () => {
  const r = planPromotion({ signal: { ...promotable, subject: "   " } });
  assert.equal(r.ok === false && r.violations[0].code, "company_required");
});

test("an unscored signal cannot be promoted through this path either", () => {
  const r = planPromotion({ signal: { ...promotable, score: null } });
  assert.equal(r.ok === false && r.violations[0].code, "score_required");
});
