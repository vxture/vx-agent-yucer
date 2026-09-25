import { test } from "node:test";
import assert from "node:assert/strict";
import { planEvidence, slotStates, type EvidenceVersion } from "./evidence";
import { unwrap } from "../../shared/result";

const v = (over: Partial<EvidenceVersion>): EvidenceVersion => ({
  id: "e1",
  slot: "pain",
  statement: "月底盘点需停业半天",
  interactionId: null,
  authorSub: "usr_a",
  source: "manual",
  proposalId: null,
  recordedAt: new Date("2026-09-01T00:00:00Z"),
  ...over,
});

test("the latest version is current; empty is cleared; a citation makes it grounded", () => {
  const s = slotStates([
    v({ id: "e1" }),
    v({ id: "e2", statement: "盘点停业半天，影响营业额", interactionId: "int_1", recordedAt: new Date("2026-09-10T00:00:00Z") }),
    v({ id: "e3", slot: "metrics", statement: "", recordedAt: new Date("2026-09-11T00:00:00Z") }),
  ]);
  assert.equal(s.pain.current?.id, "e2");
  assert.equal(s.pain.filled, true);
  assert.equal(s.pain.grounded, true);
  assert.deepEqual(s.pain.history.map((h) => h.id), ["e2", "e1"]);
  assert.equal(s.metrics.filled, false, "cleared");
  assert.equal(s.status_quo.current, null, "never written");
});

test("a save that changes nothing is not a version; clearing an empty slot neither", () => {
  const latest = v({});
  assert.equal(unwrap(planEvidence({ slot: "pain", statement: "  月底盘点需停业半天 " }, latest)), null);
  assert.equal(unwrap(planEvidence({ slot: "pain", statement: "" }, null)), null);
  assert.deepEqual(unwrap(planEvidence({ slot: "pain", statement: "月底盘点需停业半天", interactionId: "int_1" }, latest)), {
    slot: "pain",
    statement: "月底盘点需停业半天",
    interactionId: "int_1",
  });
  // Clearing drops the citation with the statement.
  assert.deepEqual(unwrap(planEvidence({ slot: "pain", statement: "", interactionId: "int_1" }, latest)), {
    slot: "pain",
    statement: "",
    interactionId: null,
  });
});

test("unknown slot and over-long statement are refused", () => {
  const bad = planEvidence({ slot: "budget", statement: "x" }, null);
  assert.equal(bad.ok === false && bad.violations[0].code, "evidence_slot_unknown");
  const long = planEvidence({ slot: "pain", statement: "x".repeat(2001) }, null);
  assert.equal(long.ok === false && long.violations[0].code, "evidence_too_long");
});
