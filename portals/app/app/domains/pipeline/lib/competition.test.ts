import { test } from "node:test";
import assert from "node:assert/strict";
import {
  competitiveField,
  matchCompetitor,
  planCompetitor,
  planCompetitorEntry,
  planDecisionCriterion,
  winRateAgainst,
  type CompetitorEntry,
  type CompetitorRecord,
} from "./competition";

const known: CompetitorRecord[] = [
  { id: "c1", name: "友商甲", aliases: ["甲科技", "Jia Tech"], sortOrder: 0 },
  { id: "c2", name: "友商乙", aliases: [], sortOrder: 1 },
];
let t = 0;
const at = () => new Date(Date.UTC(2026, 8, 1) + ++t * 1000);
const entry = (over: Partial<CompetitorEntry>): CompetitorEntry => ({
  id: `e${t}`,
  competitorId: "c1",
  isIncumbent: false,
  present: true,
  interactionId: null,
  authorSub: "usr",
  source: "manual",
  proposalId: null,
  recordedAt: at(),
  ...over,
});

test("the field: nothing recorded is 未知, never 'no competition'", () => {
  const f = competitiveField([]);
  assert.equal(f.unknown, true);
  assert.equal(f.onlyUs, false);
  assert.deepEqual(f.rivals, []);
});

test("the field reads the LATEST version of each rival; out means out", () => {
  const f = competitiveField([
    entry({ competitorId: "c1" }),
    entry({ competitorId: "c2", isIncumbent: true, interactionId: "int_1" }),
    entry({ competitorId: "c1", present: false }),
  ]);
  assert.deepEqual(f.rivals.map((r) => [r.competitorId, r.isIncumbent, r.grounded]), [["c2", true, true]]);
  assert.deepEqual(f.out, ["c1"]);
  assert.equal(f.unknown, false);
});

test("'only us' holds until a rival is recorded after it", () => {
  const onlyUs = entry({ competitorId: null });
  assert.equal(competitiveField([onlyUs]).onlyUs, true);
  assert.equal(competitiveField([onlyUs, entry({ competitorId: "c2" })]).onlyUs, false);
});

test("planning an entry: unknown rival refused; the same standing twice is no new version", () => {
  const r = planCompetitorEntry({ competitorId: "nope" }, [], known);
  assert.equal(r.ok === false && r.violations[0]!.code, "competitor_not_found");
  const first = planCompetitorEntry({ competitorId: "c1" }, [], known);
  assert.ok(first.ok && first.value);
  const again = planCompetitorEntry({ competitorId: "c1" }, [entry({ competitorId: "c1" })], known);
  assert.deepEqual(again.ok && again.value, null);
  // Dropping out a rival that was never in is not a finding.
  assert.deepEqual((planCompetitorEntry({ competitorId: "c2", present: false }, [], known) as { value: unknown }).value, null);
});

test("'only us' is refused while a rival is still present, and cannot be an incumbent", () => {
  const r = planCompetitorEntry({ competitorId: null }, [entry({ competitorId: "c1" })], known);
  assert.equal(r.ok === false && r.violations[0]!.code, "only_us_with_rivals");
  const r2 = planCompetitorEntry({ competitorId: null, isIncumbent: true }, [], known);
  assert.equal(r2.ok === false && r2.violations[0]!.code, "only_us_is_plain");
});

test("criteria: statement required and bounded; shaped_by and fit are closed sets; fit may be unassessed", () => {
  assert.equal((planDecisionCriterion({ statement: "  " }) as { ok: boolean }).ok, false);
  const ok1 = planDecisionCriterion({ statement: " 支持私有化部署 ", shapedBy: "rfp", fit: "partial", fitNote: " 需二期 " });
  assert.deepEqual(ok1.ok && ok1.value, { statement: "支持私有化部署", shapedBy: "rfp", fit: "partial", fitNote: "需二期" });
  const blank = planDecisionCriterion({ statement: "三年 TCO 最低" });
  assert.deepEqual(blank.ok && blank.value, { statement: "三年 TCO 最低", shapedBy: "unknown", fit: null, fitNote: null });
  const bad = planDecisionCriterion({ statement: "x", fit: "maybe" });
  assert.equal(bad.ok === false && bad.violations[0]!.code, "fit_unknown");
});

test("a rival is matched by name or alias, whitespace and case aside", () => {
  assert.equal(matchCompetitor(" jia  tech ", known)?.id, "c1");
  assert.equal(matchCompetitor("甲科技", known)?.id, "c1");
  assert.equal(matchCompetitor("丙", known), null);
});

test("a new rival may not reuse a name or alias; renaming itself is fine", () => {
  const taken = planCompetitor({ name: "甲科技" }, known);
  assert.equal(taken.ok === false && taken.violations[0]!.code, "competitor_taken");
  assert.equal(planCompetitor({ name: "友商甲", aliases: ["Jia"] }, known, "c1").ok, true);
  const dedup = planCompetitor({ name: "友商丙", aliases: ["丙", " 丙 ", "友商丙"] }, known);
  assert.deepEqual(dedup.ok && dedup.value, { name: "友商丙", aliases: ["丙"] });
});

test("win rate: decided reviews in the window only, and no number below five", () => {
  const since = new Date(Date.UTC(2025, 9, 1));
  const r = (outcome: string, days: number, competitorId: string | null = "c1") => ({
    competitorId,
    outcome,
    reviewedAt: new Date(Date.UTC(2026, 0, 1) + days * 86_400_000),
  });
  const four = [r("won", 1), r("lost", 2), r("won", 3), r("abandoned", 4), r("won", 5, "c2")];
  assert.deepEqual(winRateAgainst(four, "c1", since), { won: 2, decided: 3, rate: null });
  const six = [...four, r("lost", 6), r("won", 7)];
  assert.deepEqual(winRateAgainst(six, "c1", since), { won: 3, decided: 5, rate: 0.6 });
});
