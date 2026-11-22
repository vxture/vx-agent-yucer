import assert from "node:assert/strict";
import { test } from "node:test";
import {
  executionAllowed,
  executionRisk,
  needsExecutionConfirmation,
} from "./execution-policy";
import { mergeForm } from "./lib/business-form";
const future = new Date(Date.now() + 60000),
  past = new Date(0);
test("modes change confirmation cadence, never risk or scope", () => {
  const form = mergeForm(null, "segment", null, { name: "Market" });
  assert.equal(executionRisk(form, "save"), "routine");
  assert.equal(executionRisk(form, "publish"), "destructive");
  assert.equal(
    executionRisk({ ...form, module: "sales_plan" }, "save"),
    "important",
  );
  for (const mode of ["ask_always", "ask_high_risk", "autonomous"] as const) {
    assert.equal(needsExecutionConfirmation(mode, "destructive"), true);
    for (const risk of ["routine", "important", "destructive"] as const) {
      const base = {
        mode,
        risk,
        confirmed: true,
        expiresAt: future,
        revokedAt: null,
        stepExpiresAt: future,
        used: 0,
        budget: 1,
        now: new Date(),
      };
      assert.doesNotThrow(() => executionAllowed(base));
      for (const patch of [
        { revokedAt: past },
        { expiresAt: past },
        { stepExpiresAt: past },
        { used: 1 },
      ])
        assert.throws(() => executionAllowed({ ...base, ...patch }));
      if (needsExecutionConfirmation(mode, risk))
        assert.throws(
          () => executionAllowed({ ...base, confirmed: false }),
          /human_decision_required/,
        );
      else
        assert.doesNotThrow(() =>
          executionAllowed({ ...base, confirmed: false }),
        );
    }
  }
});
