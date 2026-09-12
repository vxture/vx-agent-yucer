import { strict as assert } from "node:assert";
import { test } from "node:test";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { InMemoryPlanningStore } from "../../domains/planning/store";
import { listOrgUnits } from "../../domains/planning/service";
import { InMemoryAccountStore } from "../../domains/account/store";
import { MARKET_DIVISIONS } from "../../domains/shared/market-division";
import { applyStartupPreset } from "./startup-preset";

// 新租户预置 (owner, 2026-09-12: 全国性大公司 + 5 分区) - the whole
// applyOrgTemplate + importDivisionTemplate + upsertTerritory +
// setUnitDivisions orchestration, exercised the same way a brand-new real
// workspace's first login runs it (session.ts's ensureStartupPreset), just
// with contexts built by hand instead of a resolved session.

const WS = "ws_startup";

function ctxOf<T>(store: T) {
  return {
    workspaceId: WS,
    sub: "usr_owner",
    holder: { permissions: new Set(permissionsForRoles(["sales_leader"])) },
    entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer" as const, tier: "enterprise" as const },
    store,
  };
}

const unwrap = <T,>(r: { ok: boolean; value?: T; violations?: readonly { code: string }[] }): T => {
  assert.ok(r.ok, `refused: ${r.violations?.[0]?.code}`);
  return r.value as T;
};

test("总部 + 5 大区 + one team per region, on a brand-new workspace", async () => {
  const planningCtx = ctxOf(new InMemoryPlanningStore());
  const accountCtx = ctxOf(new InMemoryAccountStore());

  const result = await applyStartupPreset(planningCtx, accountCtx, {
    orgKey: "national_medium",
    divisionKey: "five",
    autoAssociate: true,
  });
  assert.ok(result.ok, `refused: ${!result.ok && result.error}`);

  // 1 总部 + 5 大区 + 5 团队 (one team per region, regionUnits' own shape).
  assert.equal(result.units, 11);
  assert.equal(result.divisions, MARKET_DIVISIONS.length);
  // Every division got a matching territory, auto-linked to the one unit
  // whose name contains it (the 大区 unit itself, not the team under it -
  // the team's name is "销售一部", which names no division).
  assert.equal(result.territories, MARKET_DIVISIONS.length);
  assert.equal(result.linkedUnits, MARKET_DIVISIONS.length);
  // THE STEP applyStartupTemplateAction never did: org_unit_division, one
  // per matched region unit.
  assert.equal(result.linkedDivisions, MARKET_DIVISIONS.length);

  const units = unwrap(await listOrgUnits(planningCtx));
  assert.deepEqual(
    [...units.map((u) => u.name)].sort(),
    [
      "总部",
      ...MARKET_DIVISIONS.map((d) => `${d.name}大区`),
      ...MARKET_DIVISIONS.map(() => "销售一部"),
    ].sort(),
  );

  const territories = await planningCtx.store.listTerritories(WS, { includeRetired: false });
  assert.equal(territories.length, MARKET_DIVISIONS.length);
  for (const t of territories) {
    assert.equal(t.unitIds.length, 1, `${t.name}: exactly one unit linked`);
    assert.equal(t.divisionIds.length, 1, `${t.name}: exactly one division linked`);
  }

  const links = await planningCtx.store.listUnitDivisionLinks(WS);
  const linkedUnitIds = links.flatMap((l) => l.unitIds);
  assert.equal(linkedUnitIds.length, MARKET_DIVISIONS.length);
  // The unit org_unit_division links and the unit territory_unit links name
  // the SAME units - both relations point at the 大区 unit itself.
  assert.deepEqual([...linkedUnitIds].sort(), territories.flatMap((t) => [...t.unitIds]).sort());
});

test("a denied permission refuses cleanly rather than seeding half a tree", async () => {
  const planningCtx = { ...ctxOf(new InMemoryPlanningStore()), holder: { permissions: new Set<string>() } };
  const accountCtx = ctxOf(new InMemoryAccountStore());
  const result = await applyStartupPreset(planningCtx as never, accountCtx, {
    orgKey: "national_medium",
    divisionKey: "five",
    autoAssociate: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "permission_denied");
});
