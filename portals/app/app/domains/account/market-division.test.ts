import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  divisionCode,
  localCode,
  scopePrefix,
} from "../shared/market-division";
import { InMemoryAccountStore } from "./store";
import {
  importDivisionTemplate,
  removeMarketDivision,
  saveMarketDivision,
  marketScope,
  setMarketScope,
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
  const westBefore = before.find((d) => d.code === "CHINA-WEST")!.provinces.length;

  const r = unwrap(await saveMarketDivision(ctxOf(s), {
    code: "CHINA-XINJIANG", name: "新疆基地", provinces: ["新疆维吾尔自治区"],
  }));
  // Reported, not silent: this reorganised somebody else's division.
  assert.deepEqual(r.moved, [{ province: "新疆维吾尔自治区", from: "西部" }]);

  const after = await s.listMarketDivisions(WS);
  assert.equal(after.length, 6);
  const west = after.find((d) => d.code === "CHINA-WEST")!;
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
  const east = (await s.listMarketDivisions(WS)).find((d) => d.code === "CHINA-EAST")!;
  const kept = east.provinces.filter((p) => p !== "山东省");

  unwrap(await saveMarketDivision(ctxOf(s), { code: "CHINA-EAST", name: east.name, provinces: kept }));

  const rows = await s.listMarketDivisions(WS);
  const placed = rows.flatMap((d) => d.provinces);
  assert.equal(placed.includes("山东省"), false, "it is unplaced");
  assert.equal(placed.length, ALL_PROVINCES.length - 1);
});

test("a division still holding provinces cannot be removed", async () => {
  // The foreign key's own ON DELETE RESTRICT, said in the product's terms:
  // cascading would unplace everything it held with nothing to say why.
  const s = new InMemoryAccountStore();
  const r = await removeMarketDivision(ctxOf(s), "CHINA-EAST");
  assert.equal(r.ok, false);
  assert.equal(r.violations?.[0]?.code, "division_not_empty");
});

test("an emptied division can be removed", async () => {
  const s = new InMemoryAccountStore();
  const east = (await s.listMarketDivisions(WS)).find((d) => d.code === "CHINA-EAST")!;
  await saveMarketDivision(ctxOf(s), { code: "CHINA-EAST", name: east.name, provinces: [] });
  unwrap(await removeMarketDivision(ctxOf(s), "CHINA-EAST"));
  const rows = await s.listMarketDivisions(WS);
  assert.equal(rows.some((d) => d.code === "CHINA-EAST"), false);
});

test("a province outside the 34 is refused before anything is written", async () => {
  const s = new InMemoryAccountStore();
  const r = await saveMarketDivision(ctxOf(s), {
    code: "CHINA-BAD", name: "试试", provinces: ["江苏"],
  });
  assert.equal(r.ok, false);
  assert.equal(r.violations?.[0]?.code, "province_unknown");
  const rows = await s.listMarketDivisions(WS);
  assert.equal(rows.some((d) => d.code === "bad"), false, "nothing was created");
});

// --- 市场范围 (incr/0043) ---------------------------------------------------

test("a code has to carry the frame's prefix, and the form never lets it not", async () => {
  const s = new InMemoryAccountStore();
  // The form composes CHINA-<local>; an import that skips it is refused in
  // the product's words before chk_market_division_code_frame refuses it in
  // Postgres's.
  const r = await saveMarketDivision(ctxOf(s), { code: "XINJIANG", name: "新疆基地", provinces: [] });
  assert.equal(r.ok === false && r.violations[0].code, "code_prefix");
  assert.equal(divisionCode({ kind: "china", code: null }, "xin jiang"), "CHINA-XIN_JIANG");
  assert.equal(localCode({ kind: "china", code: null }, "CHINA-EAST"), "EAST");
  assert.equal(scopePrefix({ kind: "province", code: "GD" }), "GD-");
});

test("only the china frame is open in this build, and the rule says so", async () => {
  const s = new InMemoryAccountStore();
  const global = await setMarketScope(ctxOf(s), { kind: "global", code: null });
  assert.equal(global.ok === false && global.violations[0].code, "scope_not_open");
  const bogus = await setMarketScope(ctxOf(s), { kind: "moon" as never, code: null });
  assert.equal(bogus.ok === false && bogus.violations[0].code, "scope_unknown");
  // Setting china (explicitly) is allowed, and a china frame carries no province.
  assert.deepEqual(unwrap(await setMarketScope(ctxOf(s), { kind: "china", code: "GD" })), {
    kind: "china",
    code: null,
  });
  assert.deepEqual(unwrap(await marketScope(ctxOf(s))), { kind: "china", code: null });
});

test("a shipped carve is refused outside the frame it cuts", async () => {
  /* Both templates carve 中国市场. The service refuses before a single row is
     written, because the alternative is a CHECK error on the first CHINA-*
     code inside a global frame - after some rows landed. Driven through the
     store directly: the service will not let a frame that is not open be
     chosen, so this is the state the rule guards against, not one a person
     can reach today. */
  const s = new InMemoryAccountStore();
  await s.setMarketScope(WS, { kind: "global", code: null });
  const r = await importDivisionTemplate(ctxOf(s), "five");
  assert.equal(r.ok === false && r.violations[0].code, "template_scope_mismatch");
  assert.equal((await s.listMarketDivisions(WS)).length, 0, "a global frame lists no china carve");
});
