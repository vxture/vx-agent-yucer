import { test } from "node:test";
import assert from "node:assert/strict";
import { unverifiedAmounts, type AssessedDeal } from "./unverified";

// 未经证实金额 (deal batch 9d): unmet or unjudgeable exit criteria, an unreadable
// check, or a risk-band assessment make a deal's amount unverified.

const d = (over: Partial<AssessedDeal> & { id: string }): AssessedDeal => ({
  name: over.id,
  category: "commit",
  amount: 100,
  exit: { total: 3, unmet: [], unknown: [] },
  score: 80,
  risk: false,
  ...over,
});

test("each cause counts, a sound deal does not, and a stage with no criteria is not a shortfall", () => {
  const [commit, best] = unverifiedAmounts(
    [
      d({ id: "sound", amount: 500 }),
      d({ id: "unmet", amount: 200, exit: { total: 3, unmet: ["经济决策人 30 天内触达"], unknown: [] } }),
      d({ id: "unknown", amount: 150, exit: { total: 2, unmet: [], unknown: ["决策流程已写明"] } }),
      d({ id: "unreadable", amount: 90, exit: null }),
      d({ id: "risky", amount: 60, score: 32, risk: true }),
      d({ id: "nocriteria", amount: 40, exit: { total: 0, unmet: [], unknown: [] } }),
      d({ id: "best", category: "best_case", amount: 70, exit: { total: 1, unmet: ["x"], unknown: [] } }),
    ],
    ["commit", "best_case"],
  );
  assert.equal(commit!.total, 1040);
  assert.equal(commit!.unverified, 500);
  assert.deepEqual(commit!.deals.map((x) => x.id), ["unmet", "unknown", "unreadable", "risky"]);
  assert.deepEqual(commit!.deals.find((x) => x.id === "risky")!.reasons, [{ kind: "assessment_risk", score: 32 }]);
  assert.equal(best!.unverified, 70);
});
