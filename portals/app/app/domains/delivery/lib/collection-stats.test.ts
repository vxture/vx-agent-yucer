import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ageingBand,
  ageingBands,
  ageingKey,
  collectionStats,
  type CollectionStatsRow,
} from "./collection-stats";

const NOW = new Date("2026-09-06T00:00:00Z");

const row = (over: Partial<CollectionStatsRow> = {}): CollectionStatsRow => ({
  projectId: "prj_1",
  projectName: "retail platform",
  status: "invoiced",
  plannedAmount: 100_000,
  actualAmount: null,
  dueAt: "2026-12-01",
  ...over,
});

const bandOf = (dueAt: string | null, cutoffs?: readonly number[]) =>
  ageingKey(ageingBand(dueAt, NOW, cutoffs));

test("the ageing bands are the calendar, not a status", () => {
  assert.equal(bandOf("2026-12-01"), "not_due");
  assert.equal(bandOf("2026-09-06"), "not_due", "due today is not yet late");
  assert.equal(bandOf("2026-09-05"), "d1_30");
  assert.equal(bandOf("2026-08-07"), "d1_30", "30 days is still the first band");
  assert.equal(bandOf("2026-08-06"), "d31_60");
  assert.equal(bandOf("2026-07-08"), "d31_60", "60 days is still the second band");
  assert.equal(bandOf("2026-07-07"), "d61_plus");
});

test("the cutoffs are the workspace's, and the bands follow them", () => {
  // incr/0042. The same row lands in a different band under a different
  // policy, which is the whole point: 30/60 is one way to age a receivable and
  // 45/90 is another, and neither is a fact about selling.
  assert.equal(bandOf("2026-08-06", [45, 90]), "d1_45", "31 days late is inside a 45-day band");
  assert.equal(bandOf("2026-07-07", [45, 90]), "d46_90");
  assert.equal(bandOf("2026-05-01", [45, 90]), "d91_plus");
  // One cutoff is a legal policy: late, and very late.
  assert.deepEqual(
    ageingBands([30]).map(ageingKey),
    ["not_due", "d1_30", "d31_plus", "no_due_date"],
  );
});

// Not measurable, rather than early.
test("no due date is its own band", () => {
  assert.equal(bandOf(null), "no_due_date");
  const s = collectionStats([row({ dueAt: null })], NOW);
  assert.deepEqual(
    s.ageing.map((b) => b.key),
    ["no_due_date"],
    "it must not be folded into not_due, where nobody would chase it",
  );
});

test("empty bands are dropped rather than drawn as zero", () => {
  const s = collectionStats([row({ dueAt: "2026-08-01" })], NOW);
  assert.deepEqual(s.ageing.map((b) => b.key), ["d31_60"]);
});

test("settled money leaves the ageing chart - it is not outstanding", () => {
  const s = collectionStats(
    [row({ status: "settled", actualAmount: 100_000, dueAt: "2026-01-01" })],
    NOW,
  );
  assert.deepEqual(s.ageing, []);
  assert.equal(s.collected, 100_000);
});

// The decision has been taken; counting it either way overstates something.
test("written off is out of every cut", () => {
  const s = collectionStats(
    [row({ status: "written_off", plannedAmount: 500_000, dueAt: "2026-01-01" })],
    NOW,
  );
  assert.deepEqual(s.ageing, []);
  assert.deepEqual(s.byProject, []);
  assert.equal(s.promised, 0);
  assert.equal(s.collected, 0);
});

test("collected is what arrived, not what was planned for it", () => {
  const s = collectionStats(
    [
      row({ status: "settled", plannedAmount: 300_000, actualAmount: 250_000 }),
      row({ id: "b", plannedAmount: 200_000 } as Partial<CollectionStatsRow>),
    ],
    NOW,
  );
  assert.equal(s.promised, 500_000);
  assert.equal(s.collected, 250_000, "short payment is not rounded up to the plan");
});

test("by project is outstanding money, largest first", () => {
  const s = collectionStats(
    [
      row({ projectId: "a", projectName: "A", plannedAmount: 100_000 }),
      row({ projectId: "b", projectName: "B", plannedAmount: 400_000 }),
      row({ projectId: "b", projectName: "B", plannedAmount: 50_000 }),
    ],
    NOW,
  );
  assert.deepEqual(
    s.byProject.map((p) => [p.name, p.amount, p.count]),
    [
      ["B", 450_000, 2],
      ["A", 100_000, 1],
    ],
  );
});

test("nothing at all is not a crash", () => {
  const s = collectionStats([], NOW);
  assert.deepEqual(s.ageing, []);
  assert.deepEqual(s.byProject, []);
  assert.equal(s.promised, 0);
  assert.equal(s.collected, 0);
});
