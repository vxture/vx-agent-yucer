import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMeetingBrief, BRIEF_MAX_PROPOSALS } from "./meeting-brief";

const NOW = new Date("2026-09-22T00:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
const OK = <T>(value: T) => ({ state: "ok" as const, value });
const NO_CONCLUSION = OK({ health: null, proposals: [] });

test("commitments: missed, overdue and due-soon are in, most behind first; the rest are out", () => {
  const b = buildMeetingBrief(
    {
      attendees: [],
      commitments: OK([
        { id: "far", direction: "we_owe", statement: "", dueAt: at(40), status: "open" },
        { id: "soon", direction: "they_owe", statement: "", dueAt: at(5), status: "open" },
        { id: "late", direction: "we_owe", statement: "", dueAt: at(-3), status: "open" },
        { id: "missed", direction: "we_owe", statement: "", dueAt: at(-10), status: "missed" },
        { id: "met", direction: "we_owe", statement: "", dueAt: at(-1), status: "met" },
        { id: "waived", direction: "we_owe", statement: "", dueAt: at(2), status: "waived" },
      ]),
      instalments: OK([]),
      conclusion: NO_CONCLUSION,
    },
    NOW,
  );
  assert.equal(b.commitments.state, "ok");
  if (b.commitments.state !== "ok") return;
  assert.deepEqual(b.commitments.items.map((c) => [c.id, c.urgency]), [
    ["missed", "missed"],
    ["late", "overdue"],
    ["soon", "soon"],
  ]);
});

test("money: overdue and due within 30 days, never settled or written off", () => {
  const b = buildMeetingBrief(
    {
      attendees: [],
      commitments: OK([]),
      instalments: OK([
        { id: "overdue", label: "", status: "overdue", dueAt: at(-8), amount: 1, currency: "CNY" },
        { id: "soon", label: "", status: "invoiced", dueAt: at(20), amount: 1, currency: "CNY" },
        { id: "far", label: "", status: "planned", dueAt: at(90), amount: 1, currency: "CNY" },
        { id: "paid", label: "", status: "settled", dueAt: at(-2), amount: 1, currency: "CNY" },
        { id: "off", label: "", status: "written_off", dueAt: at(-2), amount: 1, currency: "CNY" },
      ]),
      conclusion: NO_CONCLUSION,
    },
    NOW,
  );
  if (b.money.state !== "ok") return assert.fail("money should read");
  assert.deepEqual(b.money.items.map((i) => [i.id, i.overdue]), [["overdue", true], ["soon", false]]);
});

test("each part stands alone: refused and failed pass through, the others still build", () => {
  const b = buildMeetingBrief(
    {
      attendees: [{ contactId: "c1", name: "Wang", title: null, roles: [] }],
      commitments: { state: "failed" },
      instalments: { state: "refused" },
      conclusion: OK({ health: { score: 40, concernCode: "quiet_days", concernDays: 60 }, proposals: [] }),
    },
    NOW,
  );
  assert.deepEqual(b.commitments, { state: "failed" });
  assert.deepEqual(b.money, { state: "refused" });
  assert.equal(b.conclusion.state, "ok");
  assert.equal(b.attendees.length, 1);
});

test("conclusion: the most confident proposals first, capped", () => {
  const proposals = [10, 90, null, 50, 70].map((confidence, i) => ({ id: `p${i}`, title: "t", rationale: null, confidence }));
  const b = buildMeetingBrief(
    { attendees: [], commitments: OK([]), instalments: OK([]), conclusion: OK({ health: null, proposals }) },
    NOW,
  );
  if (b.conclusion.state !== "ok") return assert.fail("conclusion should read");
  assert.equal(b.conclusion.items.length, BRIEF_MAX_PROPOSALS);
  assert.deepEqual(b.conclusion.items.map((p) => p.confidence), [90, 70, 50]);
});
