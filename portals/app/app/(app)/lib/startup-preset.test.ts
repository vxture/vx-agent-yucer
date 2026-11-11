import { strict as assert } from "node:assert";
import { test } from "node:test";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { InMemoryPlanningStore } from "../../domains/planning/store";
import { listOrgUnits } from "../../domains/planning/service";
import { InMemoryAccountStore } from "../../domains/account/store";
import { MARKET_DIVISIONS } from "../../domains/shared/market-division";
import { applyStartupPreset, ensureSalesTerritories } from "./startup-preset";

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

test("existing organization and configured carve recover a missing sales roster without resetting either", async () => {
  const planningCtx = ctxOf(new InMemoryPlanningStore());
  const accountCtx = ctxOf(new InMemoryAccountStore());
  unwrap(await listOrgUnits(planningCtx));
  const beforeUnits = await planningCtx.store.listOrgUnits(WS);
  const divisions = await accountCtx.store.listMarketDivisions(WS);
  const first = divisions[0]!;
  await accountCtx.store.upsertMarketDivision(WS, { code: first.code, name: "Custom region", sortOrder: 42 });
  await planningCtx.store.setUnitDivisions(WS, beforeUnits[0]!.id, [first.id]);
  const beforeDivisions = await accountCtx.store.listMarketDivisions(WS);
  const beforeLinks = await planningCtx.store.listUnitDivisionLinks(WS);

  await ensureSalesTerritories(planningCtx, accountCtx);
  const roster = await planningCtx.store.listTerritories(WS);
  assert.equal(roster.length, beforeDivisions.length);
  assert.equal(roster.find((t) => t.divisionIds.includes(first.id))?.name, "Custom region");
  assert.deepEqual(roster.find((t) => t.divisionIds.includes(first.id))?.unitIds, [beforeUnits[0]!.id]);
  assert.deepEqual(await planningCtx.store.listOrgUnits(WS), beforeUnits);
  assert.deepEqual(await planningCtx.store.listUnitDivisionLinks(WS), beforeLinks);
  assert.deepEqual(await accountCtx.store.listMarketDivisions(WS), beforeDivisions);
  await ensureSalesTerritories(planningCtx, accountCtx);
  assert.deepEqual(await planningCtx.store.listTerritories(WS), roster);
});

test("repair resumes a partial automatic roster and preserves edited existing rows", async () => {
  const planningCtx = ctxOf(new InMemoryPlanningStore());
  const accountCtx = ctxOf(new InMemoryAccountStore());
  const divisions = await accountCtx.store.listMarketDivisions(WS);
  const first = divisions[0]!;
  await planningCtx.store.upsertTerritory(WS, {
    territoryCode: `AUTO-${first.code}`, name: "Owner edited name", parentId: null,
    ownerSub: "usr_region_owner", status: "active", divisionIds: [first.id], unitIds: [],
  });
  const original = (await planningCtx.store.listTerritories(WS))[0]!;
  await ensureSalesTerritories(planningCtx, accountCtx);
  const rows = await planningCtx.store.listTerritories(WS);
  assert.equal(rows.length, divisions.length);
  assert.deepEqual(rows.find((t) => t.id === original.id), original);
  assert.equal((await planningCtx.store.listTerritories("other_workspace")).length, 0);
});

test("repair uses the workspace's provincial carve rather than the national default", async () => {
  const planningCtx = ctxOf(new InMemoryPlanningStore());
  const accountCtx = ctxOf(new InMemoryAccountStore());
  await accountCtx.store.setMarketScope(WS, { kind: "province", code: "SN" });
  const division = await accountCtx.store.upsertMarketDivision(WS, {
    code: "GUANZHONG", name: "Configured provincial region", sortOrder: 1,
  });
  await ensureSalesTerritories(planningCtx, accountCtx);
  const rows = await planningCtx.store.listTerritories(WS);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.territoryCode, "AUTO-GUANZHONG");
  assert.deepEqual(rows[0]!.divisionIds, [division.id]);
  assert.deepEqual(await accountCtx.store.getMarketScope(WS), { kind: "province", code: "SN" });
  assert.deepEqual(await accountCtx.store.listMarketDivisions(WS), [division]);
});

for (const [code, status] of [["CUSTOM", "active"], ["AUTO-north", "retired"]] as const) {
  test(`repair preserves administrator roster ${code}/${status}`, async () => {
    const planningCtx = ctxOf(new InMemoryPlanningStore());
    const accountCtx = ctxOf(new InMemoryAccountStore());
    await planningCtx.store.upsertTerritory(WS, {
      territoryCode: code, name: "Deliberate territory", parentId: null,
      ownerSub: null, status, divisionIds: [], unitIds: [],
    });
    const before = await planningCtx.store.listTerritories(WS, { includeRetired: true });
    await ensureSalesTerritories(planningCtx, accountCtx);
    assert.deepEqual(await planningCtx.store.listTerritories(WS, { includeRetired: true }), before);
  });
}

test("a reader and an unentitled workspace cannot seed territories", async () => {
  for (const restricted of [
    { holder: { permissions: new Set(permissionsForRoles(["executive"])) } },
    { entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer" as const } },
  ]) {
    const planningCtx = { ...ctxOf(new InMemoryPlanningStore()), ...restricted };
    const accountCtx = ctxOf(new InMemoryAccountStore());
    await ensureSalesTerritories(planningCtx, accountCtx);
    assert.equal((await planningCtx.store.listTerritories(WS)).length, 0);
    assert.equal((await planningCtx.store.listOrgKinds(WS)).length, 0);
  }
});

test("repair requires access to the configured carve and territory registry", async () => {
  for (const denied of ["account.read", "planning.read"]) {
    const permissions = permissionsForRoles(["sales_leader"]).filter((permission) => permission !== denied);
    const planningCtx = { ...ctxOf(new InMemoryPlanningStore()), holder: { permissions: new Set(permissions) } };
    const accountCtx = { ...ctxOf(new InMemoryAccountStore()), holder: planningCtx.holder };
    await ensureSalesTerritories(planningCtx, accountCtx);
    assert.equal((await planningCtx.store.listTerritories(WS)).length, 0);
  }
});
