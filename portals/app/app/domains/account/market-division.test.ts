import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  divisionCode,
  isSystemDivision,
  localCode,
  scopePrefix,
} from "../shared/market-division";
import { InMemoryAccountStore } from "./store";
import {
  frameMembers,
  importDivisionTemplate,
  listCarves,
  listMarketDivisions,
  moveMarketDivision,
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
    assert.equal(rows.reduce((n, d) => n + d.members.length, 0), ALL_PROVINCES.length);
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
  const placed = rows.flatMap((d) => d.members.map((m) => m.key));
  assert.equal(placed.length, ALL_PROVINCES.length);
  assert.equal(new Set(placed).size, ALL_PROVINCES.length, "no province in two divisions");
});

test("adopting a carve is reversible - back to five, still 34", async () => {
  const s = new InMemoryAccountStore();
  await importDivisionTemplate(ctxOf(s), "seven");
  unwrap(await importDivisionTemplate(ctxOf(s), "five"));
  const rows = await s.listMarketDivisions(WS);
  assert.equal(rows.length, 5);
  assert.equal(rows.flatMap((d) => d.members.map((m) => m.key)).length, ALL_PROVINCES.length);
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
  const westBefore = before.find((d) => d.code === "CHINA-WEST")!.members.length;

  const r = unwrap(await saveMarketDivision(ctxOf(s), {
    code: "CHINA-XINJIANG", name: "新疆基地", members: ["新疆维吾尔自治区"],
  }));
  // Reported, not silent: this reorganised somebody else's division.
  assert.deepEqual(r.moved.map((m) => [m.member.key, m.member.label, m.member.abbr, m.member.adcode, m.from]),
    [["新疆维吾尔自治区", "XJ 新疆", "XJ", "650000", "西部"]]);

  const after = await s.listMarketDivisions(WS);
  assert.equal(after.length, 6);
  const west = after.find((d) => d.code === "CHINA-WEST")!;
  assert.equal(west.members.some((m) => m.key === "新疆维吾尔自治区"), false);
  assert.equal(west.members.length, westBefore - 1, "only 新疆 left 西部");
  // and the country is still whole
  assert.equal(after.flatMap((d) => d.members.map((m) => m.key)).length, ALL_PROVINCES.length);
});

test("dropping a province from a division unplaces it rather than losing it", async () => {
  /* The form states the WHOLE membership, so a province left out has been
     deliberately removed. Unplaced is a state the roster reports - and the one
     the footer statistic exists to surface. */
  const s = new InMemoryAccountStore();
  const east = (await s.listMarketDivisions(WS)).find((d) => d.code === "CHINA-EAST")!;
  const kept = east.members.map((m) => m.key).filter((p) => p !== "山东省");

  unwrap(await saveMarketDivision(ctxOf(s), { code: "CHINA-EAST", name: east.name, members: kept }));

  const rows = await s.listMarketDivisions(WS);
  const placed = rows.flatMap((d) => d.members.map((m) => m.key));
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
  await saveMarketDivision(ctxOf(s), { code: "CHINA-EAST", name: east.name, members: [] });
  unwrap(await removeMarketDivision(ctxOf(s), "CHINA-EAST"));
  const rows = await s.listMarketDivisions(WS);
  assert.equal(rows.some((d) => d.code === "CHINA-EAST"), false);
});

test("a province outside the 34 is refused before anything is written", async () => {
  const s = new InMemoryAccountStore();
  const r = await saveMarketDivision(ctxOf(s), {
    code: "CHINA-BAD", name: "试试", members: ["江苏"],
  });
  assert.equal(r.ok, false);
  assert.equal(r.violations?.[0]?.code, "member_unknown");
  const rows = await s.listMarketDivisions(WS);
  assert.equal(rows.some((d) => d.code === "bad"), false, "nothing was created");
});

// --- 市场范围 (incr/0043) ---------------------------------------------------

test("a code has to carry the frame's prefix, and the form never lets it not", async () => {
  const s = new InMemoryAccountStore();
  // The form composes CHINA-<local>; an import that skips it is refused in
  // the product's words before chk_market_division_code_frame refuses it in
  // Postgres's.
  const r = await saveMarketDivision(ctxOf(s), { code: "XINJIANG", name: "新疆基地", members: [] });
  assert.equal(r.ok === false && r.violations[0].code, "code_prefix");
  assert.equal(divisionCode({ kind: "china", code: null }, "xin jiang"), "CHINA-XIN_JIANG");
  assert.equal(localCode({ kind: "china", code: null }, "CHINA-EAST"), "EAST");
  // No prefix under a province frame (0048): the province is its own column.
  assert.equal(scopePrefix({ kind: "province", code: "GD" }), "");
  assert.equal(divisionCode({ kind: "province", code: "SN" }, "guan zhong"), "GUAN_ZHONG");
});

test("中国市场 and 陕西 are open; 全球市场 and every other province are not, and the rule says so", async () => {
  const s = new InMemoryAccountStore();
  const global = await setMarketScope(ctxOf(s), { kind: "global", code: null });
  assert.equal(global.ok === false && global.violations[0].code, "scope_not_open");
  const bogus = await setMarketScope(ctxOf(s), { kind: "moon" as never, code: null });
  assert.equal(bogus.ok === false && bogus.violations[0].code, "scope_unknown");
  // A province frame names its province (owner: 选择省级时需要确定是哪个省的市场)...
  const unnamed = await setMarketScope(ctxOf(s), { kind: "province", code: null });
  assert.equal(unnamed.ok === false && unnamed.violations[0].code, "scope_code_required");
  // ...and only one with ground below it - 台湾 has none in the table yet.
  const tw = await setMarketScope(ctxOf(s), { kind: "province", code: "TW" });
  assert.equal(tw.ok === false && tw.violations[0].code, "scope_province_not_open");
  assert.deepEqual(unwrap(await setMarketScope(ctxOf(s), { kind: "province", code: "SN" })), {
    kind: "province",
    code: "SN",
  });
  // Setting china (explicitly) is allowed, and a china frame carries no province.
  assert.deepEqual(unwrap(await setMarketScope(ctxOf(s), { kind: "china", code: "GD" })), {
    kind: "china",
    code: null,
  });
  assert.deepEqual(unwrap(await marketScope(ctxOf(s))), { kind: "china", code: null });
});

test("under 陕西 a region holds cities, the roster is 陕西's own, and the china carve is untouched", async () => {
  const s = new InMemoryAccountStore();
  unwrap(await setMarketScope(ctxOf(s), { kind: "province", code: "SN" }));
  // The ground is the ten cities, not the 34 provinces.
  const ground = unwrap(await frameMembers(ctxOf(s)));
  assert.equal(ground.length, 10);
  assert.equal(ground[0]!.label, "西安");
  // Nothing carved yet in this frame - the five china divisions are not shown.
  assert.deepEqual(unwrap(await listMarketDivisions(ctxOf(s))), []);
  // A province is not a member here; a city is.
  const bad = await saveMarketDivision(ctxOf(s), { code: "XIAN", name: "西安", members: ["陕西省"] });
  assert.equal(bad.ok === false && bad.violations[0].code, "member_unknown");
  // A prefix of any kind is refused under a province frame (0048).
  const prefixed = await saveMarketDivision(ctxOf(s), { code: "SN-XIAN", name: "西安", members: [] });
  assert.equal(prefixed.ok === false && prefixed.violations[0].code, "code_shape");
  unwrap(await saveMarketDivision(ctxOf(s), { code: "XIAN", name: "西安都市圈", members: ["610100", "610400"] }));
  const rows = unwrap(await listMarketDivisions(ctxOf(s)));
  assert.deepEqual(rows.map((d) => [d.code, d.scopeProvince]), [["XIAN", "SN"]]);
  assert.deepEqual(rows[0]!.members.map((m) => m.label).sort(), ["咸阳", "西安"]);
  // Back to china: the five divisions are still there, all 34 still placed.
  unwrap(await setMarketScope(ctxOf(s), { kind: "china", code: null }));
  const china = unwrap(await listMarketDivisions(ctxOf(s)));
  assert.equal(china.length, 5);
  assert.equal(china.flatMap((d) => d.members).length, ALL_PROVINCES.length);
});

test("陕西三分法 imports under 陕西 and only there, and places all ten cities", async () => {
  const s = new InMemoryAccountStore();
  // Under china it is another frame's carve.
  const wrong = await importDivisionTemplate(ctxOf(s), "shaanxi-three");
  assert.equal(wrong.ok === false && wrong.violations[0].code, "template_unknown");
  unwrap(await setMarketScope(ctxOf(s), { kind: "province", code: "SN" }));
  // And 五分法 is not 陕西's.
  const five = await importDivisionTemplate(ctxOf(s), "five");
  assert.equal(five.ok === false && five.violations[0].code, "template_unknown");
  const r = unwrap(await importDivisionTemplate(ctxOf(s), "shaanxi-three"));
  assert.equal(r.divisions, 3);
  const rows = unwrap(await listMarketDivisions(ctxOf(s)));
  assert.deepEqual(rows.map((d) => d.name), ["关中", "陕北", "陕南"]);
  assert.equal(rows.flatMap((d) => d.members).length, 10, "every city placed");
  // 陕北 holds 延安 and 榆林 - and it reads as 系统配置 until somebody touches it.
  const north = rows.find((d) => d.code === "SHAANBEI")!;
  assert.deepEqual(north.members.map((m) => m.label).sort(), ["延安", "榆林"]);
  assert.equal(isSystemDivision(unwrap(await listCarves(ctxOf(s))), north.code, north.name, north.members.map((m) => m.key)), true);
  unwrap(await saveMarketDivision(ctxOf(s), { code: "SHAANBEI", name: north.name, members: ["610600"] }));
  const after = unwrap(await listMarketDivisions(ctxOf(s)));
  assert.equal(after.flatMap((d) => d.members).length, 9, "榆林 is unplaced, not lost");
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
  assert.equal(r.ok === false && r.violations[0].code, "template_unknown");
  assert.equal((await s.listMarketDivisions(WS)).length, 0, "a global frame lists no china carve");
});

test("the order is global and the four moves change it - inside one frame", async () => {
  const s = new InMemoryAccountStore();
  const names = async () => unwrap(await listMarketDivisions(ctxOf(s))).map((d) => d.name);
  assert.deepEqual(await names(), ["东部", "南部", "西部", "北部", "中部"]);
  unwrap(await moveMarketDivision(ctxOf(s), { code: "CHINA-CENTRAL", direction: "top" }));
  assert.deepEqual(await names(), ["中部", "东部", "南部", "西部", "北部"]);
  unwrap(await moveMarketDivision(ctxOf(s), { code: "CHINA-EAST", direction: "down" }));
  assert.deepEqual(await names(), ["中部", "南部", "东部", "西部", "北部"]);
  unwrap(await moveMarketDivision(ctxOf(s), { code: "CHINA-EAST", direction: "up" }));
  unwrap(await moveMarketDivision(ctxOf(s), { code: "CHINA-CENTRAL", direction: "bottom" }));
  assert.deepEqual(await names(), ["东部", "南部", "西部", "北部", "中部"]);
  // The ends refuse in the product's words, and an unknown code is not a move.
  const edge = await moveMarketDivision(ctxOf(s), { code: "CHINA-EAST", direction: "top" });
  assert.equal(edge.ok === false && edge.violations[0].code, "move_at_edge");
  const none = await moveMarketDivision(ctxOf(s), { code: "CHINA-MOON", direction: "up" });
  assert.equal(none.ok === false && none.violations[0].code, "not_found");
  // The sort_order written is dense from 1 - what every other reader follows.
  assert.deepEqual(
    unwrap(await listMarketDivisions(ctxOf(s))).map((d) => d.sortOrder),
    [1, 2, 3, 4, 5],
  );
  // A move under 陕西 orders 陕西's carve and leaves the china order alone.
  unwrap(await setMarketScope(ctxOf(s), { kind: "province", code: "SN" }));
  unwrap(await importDivisionTemplate(ctxOf(s), "shaanxi-three"));
  unwrap(await moveMarketDivision(ctxOf(s), { code: "SHAANNAN", direction: "top" }));
  assert.deepEqual(await names(), ["陕南", "关中", "陕北"]);
  unwrap(await setMarketScope(ctxOf(s), { kind: "china", code: null }));
  assert.deepEqual(await names(), ["东部", "南部", "西部", "北部", "中部"]);
});
