import { test } from "node:test";
import assert from "node:assert/strict";
import { annotateFreshness, FRESHNESS_THRESHOLD_DAYS } from "./evidence-quality";

const NOW = new Date("2026-09-22T00:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const note = (d: number) => ({ kind: "interaction" as const, when: ago(d), text: "" });

test("exactly at the threshold is fresh; one day past is stale (the acceptance boundary)", () => {
  const t = FRESHNESS_THRESHOLD_DAYS.interaction;
  assert.deepEqual(annotateFreshness([note(t)], NOW), { stale: false, daysAgo: t });
  assert.deepEqual(annotateFreshness([note(t + 1)], NOW), { stale: true, daysAgo: t + 1, kind: "interaction" });
});

test("judged on the NEWEST dated evidence - one recent note keeps the claim fresh", () => {
  assert.deepEqual(annotateFreshness([note(200), note(10), note(90)], NOW), { stale: false, daysAgo: 10 });
});

test("each kind has its own threshold", () => {
  const c = (d: number) => ({ kind: "commitment" as const, when: ago(d), text: "" });
  assert.equal(annotateFreshness([c(80)], NOW)?.stale, false); // under 90
  assert.equal(annotateFreshness([note(80)], NOW)?.stale, true); // over 60
  // Overridable, not hard-wired.
  assert.equal(annotateFreshness([note(80)], NOW, { interaction: 100, commitment: 90 })?.stale, false);
});

test("a future commitment date is current; structure-only claims get no freshness", () => {
  assert.deepEqual(
    annotateFreshness([{ kind: "commitment", when: ago(-10), text: "" }], NOW),
    { stale: false, daysAgo: 0 },
  );
  assert.equal(annotateFreshness([{ kind: "structure", text: "graph" }, { kind: "metric", text: "x" }], NOW), null);
});
