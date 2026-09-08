import { strict as assert } from "node:assert";
import { test } from "node:test";
import { InMemoryAccountStore } from "./store";
import {
  importDivisionTemplate,
  removeMarketDivision,
  saveMarketDivision,
} from "./service";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { permissionsForRoles } from "../../authz/catalog";
import { ALL_PROVINCES } from "../shared/provinces";

/* 大区 as the tenant owns it: adopt a shipped carve, or build your own.
 *
 * Everything here is about the INVARIANT the situation screen leans on - a
 * province sits in at most one 大区, and every figure grouped by 大区 is the
 * sum of provinces nobody else has claimed.
 */

const WS = "ws_division";
const ctxOf = (store: InMemoryAccountStore) => ({
  workspaceId: WS,
  sub: "usr_a",
  holder: { permissions: new Set(permissionsForRoles(["sales_ops"])) },
  entitlement: {
    ...EMPTY_ENTITLEMENT, workspace_id: WS, product: "yucer", tier: "enterprise" as const,
  },
  store,
});
const unwrap = <T,>(r: { ok: boolean; value?: T; violations?: { code: string }[] }): T => {
  assert.ok(r.ok, `refused: ${r.violations?.[0]?.code}`);
  return r.value as T;
};

test("a fresh workspace starts on the five-way carve", () => {
  // The preset incr/0036 seeds. Not a claim that five is right - a workspace
  // has to start somewhere.
  const s = new InMemoryAccountStore();
  return s.listMarketDivisions(WS).then((rows) => {
    assert.equal(rows.length, 5);
    assert.equal(rows.reduce((n, d) => n + d.provinces.length, 0), ALL_PROVINCES.length);
  });
});

test("adopting the seven-way carve replaces the five, and still places all 34", async () => {
  /* THE WHOLE POINT OF REPLACING. Both carves place every province, so merging
     would leave divisions from the old one holding provinces the new one has
     claimed elsewhere - a shape neither template describes. */
  const s = new InMemoryAccountStore();
  const r = unwrap(await importDivisionTemplate(ctxOf(s), "seven"));
  assert.equal(r.divisions, 7);
  /* ONE removed, not five, and the reason is worth knowing: the two carves
     SHARE four codes - east / south / north / central - so those are renamed in
     place (东部 becomes 华东) rather than dropped and recreated. Only `west`
     exists in the five-way alone. The code is the anchor, so reusing it is
     what keeps a division's history rather than orphaning it; what matters is
     the end state below, which is seven divisions holding all 34 provinces. */
  assert.equal(r.replaced, 1);

  const rows = await s.listMarketDivisions(WS);
  assert.equal(rows.length, 7);
  assert.deepEqual(
    rows.map((d) => d.name).sort(),
    ["东北", "华东", "华中", "华北", "华南", "西北", "西南"].sort(),
  );
  const placed = rows.flatMap((d) => d.provinces);
  assert.equal(placed.length, ALL_PROVINCES.length);
  assert.equal(new Set(placed).size, ALL_PROVINCES.length, "no province in two divisions");
});

test("adopting a carve is reversible - back to five, still 34", async () => {
  const s = new InMemoryAccountStore();
  await importDivisionTemplate(ctxOf(s), "seven");
  unwrap(await importDivisionTemplate(ctxOf(s), "five"));
  const rows = await s.listMarketDivisions(WS);
  assert.equal(rows.length, 5);
  assert.equal(rows.flatMap((d) => d.provinces).length, ALL_PROVINCES.length);
});

test("an unknown carve is refused rather than silently doing nothing", async () => {
  const s = new InMemoryAccountStore();
  const r = await importDivisionTemplate(ctxOf(s), "nine");
  assert.equal(r.ok, false);
  assert.equal(r.violations?.[0]?.code, "template_unknown");
});

test("the owner's case: a 新疆基地 takes 新疆 off 西部, and nothing else moves", async () => {
  const s = new InMemoryAccountStore();
  const before = await s.listMarketDivisions(WS);
  const westBefore = before.find((d) => d.code === "west")!.provinces.length;

  const r = unwrap(await saveMarketDivision(ctxOf(s), {
    code: "xinjiang", name: "新疆基地", provinces: ["新疆维吾尔自治区"],
  }));
  // Reported, not silent: this reorganised somebody else's division.
  assert.deepEqual(r.moved, [{ province: "新疆维吾尔自治区", from: "西部" }]);

  const after = await s.listMarketDivisions(WS);
  assert.equal(after.length, 6);
  const west = after.find((d) => d.code === "west")!;
  assert.equal(west.provinces.includes("新疆维吾尔自治区"), false);
  assert.equal(west.provinces.length, westBefore - 1, "only 新疆 left 西部");
  // and the country is still whole
  assert.equal(after.flatMap((d) => d.provinces).length, ALL_PROVINCES.length);
});

test("dropping a province from a division unplaces it rather than losing it", async () => {
  /* The form states the WHOLE membership, so a province left out has been
     deliberately removed. Unplaced is a state the roster reports - and the one
     the footer statistic exists to surface. */
  const s = new InMemoryAccountStore();
  const east = (await s.listMarketDivisions(WS)).find((d) => d.code === "east")!;
  const kept = east.provinces.filter((p) => p !== "山东省");

  unwrap(await saveMarketDivision(ctxOf(s), { code: "east", name: east.name, provinces: kept }));

  const rows = await s.listMarketDivisions(WS);
  const placed = rows.flatMap((d) => d.provinces);
  assert.equal(placed.includes("山东省"), false, "it is unplaced");
  assert.equal(placed.length, ALL_PROVINCES.length - 1);
});

test("a division still holding provinces cannot be removed", async () => {
  // The foreign key's own ON DELETE RESTRICT, said in the product's terms:
  // cascading would unplace everything it held with nothing to say why.
  const s = new InMemoryAccountStore();
  const r = await removeMarketDivision(ctxOf(s), "east");
  assert.equal(r.ok, false);
  assert.equal(r.violations?.[0]?.code, "division_not_empty");
});

test("an emptied division can be removed", async () => {
  const s = new InMemoryAccountStore();
  const east = (await s.listMarketDivisions(WS)).find((d) => d.code === "east")!;
  await saveMarketDivision(ctxOf(s), { code: "east", name: east.name, provinces: [] });
  unwrap(await removeMarketDivision(ctxOf(s), "east"));
  const rows = await s.listMarketDivisions(WS);
  assert.equal(rows.some((d) => d.code === "east"), false);
});

test("a province outside the 34 is refused before anything is written", async () => {
  const s = new InMemoryAccountStore();
  const r = await saveMarketDivision(ctxOf(s), {
    code: "bad", name: "试试", provinces: ["江苏"],
  });
  assert.equal(r.ok, false);
  assert.equal(r.violations?.[0]?.code, "province_unknown");
  const rows = await s.listMarketDivisions(WS);
  assert.equal(rows.some((d) => d.code === "bad"), false, "nothing was created");
});
