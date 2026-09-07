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
