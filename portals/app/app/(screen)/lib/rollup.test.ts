import { strict as assert } from "node:assert";
import { test } from "node:test";
import { rollUpByProvince, totalOf, type DealLike, type ProjectLike } from "./rollup";
import type { AccountRecord } from "../../domains/account/store";
import { ALL_PROVINCES } from "../../domains/shared/provinces";

// The screen's arithmetic. Everything it claims is a sum over three lists, and
// the sums are the half that can be wrong without anybody noticing - a rendered
// map looks equally convincing whether or not 合同额 is the value of the deals
// under it.

const account = (id: string, province: string | null): AccountRecord =>
  ({
    id, workspaceId: "ws", accountNo: id, name: id,
    industry: null, region: null, province,
    segmentCode: null, ownerSub: null, healthScore: null,
    status: "active", tier: "standard",
    creditCode: null, website: null, employeeCount: null, parentId: null,
  }) as AccountRecord;

const deal = (id: string, accountId: string, status: string, amount: number): DealLike =>
  ({ id, accountId, status, amount: { amount } });

const project = (
  id: string, accountId: string, status: string, health: string, contract: number,
): ProjectLike => ({ id, accountId, status, health, contractAmount: { amount: contract } });

test("every province appears, including the ones with nothing in them", () => {
  // A province missing from the list is a hole in the map, and a hole reads as
  // "no business" rather than "no data". The screen needs all 34 to draw.
  const r = rollUpByProvince([account("a1", "江苏省")], [], []);
  assert.equal(r.provinces.length, ALL_PROVINCES.length);
  assert.equal(r.provinces.find((p) => p.province === "西藏自治区")?.accounts, 0);
});

test("the stages reconcile - 合同额 is the won subset, not a separate figure", () => {
  const accounts = [account("a1", "江苏省"), account("a2", "江苏省")];
  const deals = [
    deal("d1", "a1", "won", 100),
    deal("d2", "a1", "lost", 300),
    deal("d3", "a2", "open", 50),
    deal("d4", "a2", "open", 70),
  ];
  const js = rollUpByProvince(accounts, deals, []).provinces.find((p) => p.province === "江苏省")!;
  assert.equal(js.accounts, 2);
  assert.equal(js.wonDeals, 1);
  assert.equal(js.contractValue, 100);
  assert.equal(js.openDeals, 2);
  assert.equal(js.pipelineValue, 120);
  // won / (won + lost) - a lost deal is decided, an open one is not
  assert.equal(js.winRate, 100 / 400);
});

test("在交付 counts only contracts still in flight", () => {
  const accounts = [account("a1", "广东省")];
  const projects = [
    project("p1", "a1", "delivering", "green", 500),
    project("p2", "a1", "delivered", "green", 900),
    project("p3", "a1", "closed", "green", 700),
  ];
  const gd = rollUpByProvince(accounts, [], projects).provinces.find((p) => p.province === "广东省")!;
  // The delivered and closed money has arrived; only p1 is still being worked.
  assert.equal(gd.inDelivery, 500);
});

test("a province with nothing delivered has NO health rate, not a zero one", () => {
  // Zero would rank a quiet province below one that is genuinely in trouble.
  const r = rollUpByProvince([account("a1", "青海省")], [], []);
  const qh = r.provinces.find((p) => p.province === "青海省")!;
  assert.equal(qh.healthRate, null);
  assert.equal(qh.winRate, null);
});

test("an account with no province is counted nationally and drawn nowhere", () => {
  // The honest handling of a real state. Dropping it would make the national
  // total disagree with the sum of the provinces and say nothing about why.
  const r = rollUpByProvince(
    [account("a1", "江苏省"), account("a2", null)],
    [deal("d1", "a2", "won", 999)],
    [],
  );
  assert.equal(r.unplacedAccounts, 1);
  assert.equal(r.provinces.reduce((s, p) => s + p.accounts, 0), 1);
  // and its deal is not smuggled into some other province
  assert.equal(r.provinces.reduce((s, p) => s + p.contractValue, 0), 0);
});

test("a province name outside the vocabulary is a fault, not a new province", () => {
  // The database's CHECK should have refused 江苏. If one ever arrives, the
  // roll-up must not invent a 35th province for it.
  const r = rollUpByProvince([account("a1", "江苏")], [], []);
  assert.equal(r.provinces.length, ALL_PROVINCES.length);
  assert.equal(r.unplacedAccounts, 1);
});

test("大区 totals are the sum of their provinces", () => {
  const accounts = [account("a1", "江苏省"), account("a2", "浙江省"), account("a3", "广东省")];
  const deals = [deal("d1", "a1", "won", 100), deal("d2", "a2", "won", 200), deal("d3", "a3", "won", 400)];
  const r = rollUpByProvince(accounts, deals, []);
  const east = totalOf(r.byRegion.get("华东")!);
  assert.equal(east.contractValue, 300, "华东 is 江苏 + 浙江, not the country");
  const nation = totalOf(r.provinces);
  assert.equal(nation.contractValue, 700);
});

test("rates average over provinces that HAVE a reading", () => {
  // Dividing by 34 would drag the national figure toward zero in proportion to
  // how many provinces are quiet - which is not what a health rate means.
  const accounts = [account("a1", "江苏省"), account("a2", "西藏自治区")];
  const projects = [
    project("p1", "a1", "delivering", "green", 10),
    project("p2", "a1", "delivering", "red", 10),
  ];
  const t = totalOf(rollUpByProvince(accounts, [], projects).provinces);
  assert.equal(t.healthRate, 0.5, "one province reads 50%; the other 33 have no reading");
});

// ---------------------------------------------------------------------------
// The three lists the six panels added. Same rule throughout: a row that cannot
// be attributed to a province is not guessed onto one.

const lead = (id: string, accountId: string | null, status: string, owner: string | null) =>
  ({ id, accountId, status, ownerSub: owner });

const NOW = new Date("2026-09-07T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const proposal = (id: string, subjectType: string, subjectId: string, status: string, age: number) =>
  ({ id, subjectType, subjectId, status, createdAt: daysAgo(age) });

const inst = (id: string, projectId: string, status: string, planned: number, actual: number | null = null) =>
  ({ id, projectId, status, plannedAmount: planned, actualAmount: actual });

test("线索供给 - a lead with no account is attributed nowhere", () => {
  // The COMMON case, not an edge one: a lead becomes an account by being
  // converted, so most live leads have no account and therefore no province.
  const r = rollUpByProvince(
    [account("a1", "江苏省")], [], [],
    { leads: [lead("l1", "a1", "new", null), lead("l2", null, "new", null)] },
  );
  const js = r.provinces.find((p) => p.province === "江苏省")!;
  assert.equal(js.leads, 1);
  assert.equal(js.leadsUnclaimed, 1);
  assert.equal(totalOf(r.provinces).leads, 1, "the unattached lead is in no province total");
});

test("线索供给 - 转商机率 is converted over all, and null when there are none", () => {
  const r = rollUpByProvince(
    [account("a1", "江苏省")], [], [],
    { leads: [
      lead("l1", "a1", "converted", "u1"), lead("l2", "a1", "converted", "u1"),
      lead("l3", "a1", "working", "u1"), lead("l4", "a1", "disqualified", null),
    ] },
  );
  const js = r.provinces.find((p) => p.province === "江苏省")!;
  assert.equal(js.leadConversion, 0.5);
  assert.equal(r.provinces.find((p) => p.province === "青海省")!.leadConversion, null);
});

test("智能副驾 - the 30-day window applies to the flow, never to the queue", () => {
  // THE DEFECT THIS PINS. Deriving 待裁决 from the window made the backlog grow
  // whenever the window widened, which is a queue that reports a flow.
  const r = rollUpByProvince(
    [account("a1", "江苏省")], [], [],
    { now: NOW, proposals: [
      proposal("p1", "account", "a1", "proposed", 3),
      proposal("p2", "account", "a1", "proposed", 400),
      proposal("p3", "account", "a1", "accepted", 3),
    ] },
  );
  const js = r.provinces.find((p) => p.province === "江苏省")!;
  assert.equal(js.pending, 2, "both proposed rows are sitting there now, whatever their age");
  assert.equal(js.proposals30, 2, "only the two inside the window are flow");
});

test("智能副驾 - only a decision counts toward 采纳率", () => {
  // expired and failed are not a refusal; counting them would report an
  // adoption rate nobody chose.
  const r = rollUpByProvince(
    [account("a1", "江苏省")], [], [],
    { now: NOW, proposals: [
      proposal("p1", "account", "a1", "accepted", 1),
      proposal("p2", "account", "a1", "executed", 1),
      proposal("p3", "account", "a1", "rejected", 1),
      proposal("p4", "account", "a1", "expired", 1),
      proposal("p5", "account", "a1", "proposed", 1),
    ] },
  );
  const js = r.provinces.find((p) => p.province === "江苏省")!;
  assert.equal(js.accepted30, 2, "executed is the human having said yes");
  assert.equal(js.decided30, 3);
  assert.equal(js.adoption, 2 / 3);
});

test("智能副驾 - a proposal reaches a province through its subject", () => {
  const accounts = [account("a1", "广东省")];
  const deals = [deal("d1", "a1", "open", 10)];
  const projects = [project("pr1", "a1", "delivering", "green", 10)];
  const r = rollUpByProvince(accounts, deals, projects, {
    now: NOW,
    proposals: [
      proposal("x1", "opportunity", "d1", "proposed", 1),
      proposal("x2", "project", "pr1", "proposed", 1),
      proposal("x3", "campaign", "unknown-c", "proposed", 1),
    ],
  });
  const gd = r.provinces.find((p) => p.province === "广东省")!;
  assert.equal(gd.pending, 2, "the opportunity and the project both resolve to a1");
  assert.equal(totalOf(r.provinces).pending, 2, "the campaign resolves to nothing and is not guessed");
});

test("回款兑现 - settled counts what arrived, live counts what was promised", () => {
  const accounts = [account("a1", "广东省")];
  const projects = [project("pr1", "a1", "delivering", "green", 1000)];
  const r = rollUpByProvince(accounts, [], projects, {
    instalments: [
      inst("i1", "pr1", "settled", 300, 280),   // short payment is normal here
      inst("i2", "pr1", "settled", 200, null),  // no actual recorded: fall back
      inst("i3", "pr1", "overdue", 400),
      inst("i4", "pr1", "planned", 100),
      inst("i5", "pr1", "written_off", 900),    // in neither cut
    ],
  });
  const gd = r.provinces.find((p) => p.province === "广东省")!;
  assert.equal(gd.collected, 480, "280 that arrived plus 200 with nothing recorded");
  assert.equal(gd.receivable, 500, "overdue and planned are still owed");
  assert.equal(gd.overdue, 400);
});

test("a scope's rates are re-derived from its totals, not averaged over provinces", () => {
  // AVERAGING RATES WEIGHTS 西藏 THE SAME AS 广东. 江苏 wins 900 of 1000 and
  // 青海 wins 0 of 100: the true rate is 900/1100, not the mean of 90% and 0%.
  const accounts = [account("a1", "江苏省"), account("a2", "青海省")];
  const deals = [
    deal("d1", "a1", "won", 900), deal("d2", "a1", "lost", 100),
    deal("d3", "a2", "lost", 100),
  ];
  const t = totalOf(rollUpByProvince(accounts, deals, []).provinces);
  assert.equal(t.winRate, 900 / 1100);
  assert.notEqual(t.winRate, (0.9 + 0) / 2);
});

test("a province that has lost everything still counts in the national denominator", () => {
  // Its own win rate is 0, and rebuilding the denominator by dividing by that
  // rate would have silently dropped its losses out of the national figure.
  const accounts = [account("a1", "江苏省"), account("a2", "青海省")];
  const deals = [deal("d1", "a1", "won", 100), deal("d2", "a2", "lost", 300)];
  const rows = rollUpByProvince(accounts, deals, []).provinces;
  assert.equal(rows.find((p) => p.province === "青海省")!.winRate, 0);
  assert.equal(totalOf(rows).winRate, 100 / 400);
});
