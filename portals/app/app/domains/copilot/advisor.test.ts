import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { ok, fail, violation, unwrap, type RuleResult } from "../shared/result";
import { InMemoryCopilotStore } from "./store";
import { runAdvisor } from "./advisor";
import type { AdvisorMeter } from "../../usage/lib/advisor-runs";

const WS = "ws_1";

function ctx(tier: Entitlement["tier"], store = new InMemoryCopilotStore()) {
  return {
    workspaceId: WS,
    sub: "usr_me",
    holder: { permissions: new Set(permissionsForRoles(["sales_rep"])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier },
    store,
  };
}

function meter(admit = true) {
  const charged: string[] = [];
  const m: AdvisorMeter = {
    admit: () => (admit ? { ok: true } : { ok: false, remaining: 0 }),
    record: async (_ws, runId) => {
      charged.push(runId);
      return `k:${runId}`;
    },
  };
  return { m, charged };
}

import type { AdvisorAtlasTags } from "./advisor";

type Gen = (run: { runId: string; atlas: AdvisorAtlasTags }) => Promise<RuleResult<unknown>>;

const req = (input: unknown, generate: Gen = async () => ok({ conflicts: 1 })) => ({
  capability: "account.consistency" as const,
  kind: "consistency_check" as const,
  subject: { type: "account" as const, id: "acc_1" },
  input,
  generate,
});

test("a free workspace runs a customer advisor; the tool loop's tier is not its gate (YC-042)", async () => {
  const { m } = meter();
  assert.equal((await runAdvisor(ctx("free"), req({ n: 1 }), { meter: m })).ok, true);
  const triage = await runAdvisor(ctx("free"), { ...req({ n: 1 }), capability: "signal.triage" }, { meter: m });
  assert.equal(triage.ok === false && triage.violations[0].code, "feature_not_in_tier");
});

test("the same input twice is one charge, one model call, and the second answer is the cached one", async () => {
  const c = ctx("free");
  const { m, charged } = meter();
  let calls = 0;
  const gen = async () => {
    calls += 1;
    return ok({ conflicts: 2 });
  };
  const first = unwrap(await runAdvisor(c, req({ notes: ["a", "b"] }, gen), { meter: m }));
  const again = unwrap(await runAdvisor(c, req({ notes: ["a", "b"] }, gen), { meter: m }));
  assert.equal(first.cached, false);
  assert.equal(again.cached, true);
  assert.deepEqual(again.content, { conflicts: 2 });
  assert.equal(again.runId, first.runId);
  assert.equal(calls, 1);
  assert.deepEqual(charged, [first.runId]);

  // Different input: a new run, a new charge.
  const other = unwrap(await runAdvisor(c, req({ notes: ["a", "c"] }, gen), { meter: m }));
  assert.notEqual(other.runId, first.runId);
  assert.equal(calls, 2);
  assert.equal(charged.length, 2);
});

test("the generation is handed the Atlas tags: the capability and the run id", async () => {
  const { m } = meter();
  let seen: unknown = null;
  const r = unwrap(
    await runAdvisor(ctx("free"), req({ n: 2 }, async (run) => {
      seen = run.atlas;
      return ok({});
    }), { meter: m }),
  );
  assert.deepEqual(seen, { featureId: "account.consistency", businessId: r.runId, applicationId: r.runId });
});

test("not admitted: no charge, no model call - the caller shows its rule part", async () => {
  const { m, charged } = meter(false);
  let calls = 0;
  const r = await runAdvisor(ctx("free"), req({ n: 3 }, async () => {
    calls += 1;
    return ok({});
  }), { meter: m });
  assert.equal(r.ok === false && r.violations[0].code, "advisor_not_admitted");
  assert.equal(calls, 0);
  assert.deepEqual(charged, []);
});

test("a failed generation is still the run that was asked for, and is not cached", async () => {
  const c = ctx("free");
  const { m, charged } = meter();
  const failing = async () => fail(violation("turn_failed", "model down", "model"));
  const r = await runAdvisor(c, req({ n: 4 }, failing), { meter: m });
  assert.equal(r.ok === false && r.violations[0].code, "turn_failed");
  assert.equal(charged.length, 1, "charged at the start, like a turn");
  const retry = unwrap(await runAdvisor(c, req({ n: 4 }), { meter: m }));
  assert.equal(retry.cached, false, "nothing was cached from the failure");
  assert.equal(charged[1], charged[0], "the retry carries the same run id, so the platform folds it");
});
