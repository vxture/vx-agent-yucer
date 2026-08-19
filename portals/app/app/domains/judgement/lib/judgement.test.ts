import { test } from "node:test";
import assert from "node:assert/strict";
import { countByUrgency, deriveJudgements, resolveScope, type AccountInput } from "./judgement";

// The judgement layer.
//
// What these assert is not "a card appeared" but "the claim is true of the
// data" - a judgement engine whose tests only check that it produced output
// would pass while producing nonsense.

const NOW = new Date("2026-08-17T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function account(over: Partial<AccountInput> = {}): AccountInput {
  return {
    accountId: "acc_1",
    accountName: "测试客户",
    ownerSub: "usr_1",
    openDeals: [{ id: "opp_1", name: "deal", stage: "谈判", amount: 2_400_000, stageDays: 48 }],
    lastContactAt: daysAgo(48),
    commitments: [],
    contacts: [],
    relations: [],
    contactActivity: [],
    notes: [
      { id: "int_1", occurredAt: daysAgo(48), channel: "电话", who: "刘敏", text: "第三条" },
      { id: "int_2", occurredAt: daysAgo(62), channel: "微信", who: "王磊", text: "第二条" },
      { id: "int_3", occurredAt: daysAgo(75), channel: "会面", who: "王磊", text: "第一条" },
    ],
    ...over,
  };
}

const theyOwe = (dueDaysAgo: number, id = "cm_1") => ({
  id,
  direction: "they_owe" as const,
  status: "open" as const,
  statement: "给出预算批复答复",
  dueAt: daysAgo(dueDaysAgo),
});

test("silence alone is not the story - a broken promise beside it is", () => {
  // 48 days quiet with nothing outstanding is a weaker signal than 48 days
  // quiet while they owe you something. Conflating them would put half the
  // pipeline in the top tier and the tier would stop meaning anything.
  const quietOnly = deriveJudgements({ accounts: [account()], now: NOW });
  assert.equal(quietOnly.some((j) => j.id === "stalled:acc_1"), false);
  assert.equal(quietOnly.some((j) => j.id === "quiet:acc_1"), true);
  assert.equal(quietOnly.find((j) => j.id === "quiet:acc_1")?.urgency, "week");

  const withBroken = deriveJudgements({
    accounts: [account({ commitments: [theyOwe(41)] })],
    now: NOW,
  });
  const stalled = withBroken.find((j) => j.id === "stalled:acc_1");
  assert.ok(stalled, "the two together produce the top-tier judgement");
  assert.equal(stalled.urgency, "today");
  // And the weaker one does NOT also fire - one situation, one card.
  assert.equal(withBroken.some((j) => j.id === "quiet:acc_1"), false);
});

test("a rule judgement states the condition that produced it", () => {
  // A rule that will not say what triggered it cannot be checked, and an
  // uncheckable rule is indistinguishable from an opinion.
  const js = deriveJudgements({ accounts: [account({ commitments: [theyOwe(41)] })], now: NOW });
  for (const j of js.filter((x) => x.source === "rule")) {
    assert.ok(j.rule && j.rule.length > 0, `${j.id} has no stated trigger`);
  }
});

test("every rule judgement cites the rows it read", () => {
  const js = deriveJudgements({ accounts: [account({ commitments: [theyOwe(41)] })], now: NOW });
  const stalled = js.find((j) => j.id === "stalled:acc_1");
  assert.equal(stalled?.citations.length, 3, "three notes, verbatim");
  assert.equal(stalled?.citations[0].text, "第三条", "newest first");
  assert.ok(stalled?.citations.every((c) => c.text.length > 0));
});

test("the decision-maker rule needs BOTH the structure and the evidence to agree", () => {
  // Two independent routes to one verdict. If the org chart were filled in
  // optimistically, the participant records would still catch it.
  const contacts = [
    { id: "ct_coach", decisionRole: "coach" as const, influence: 50, status: "active" },
    { id: "ct_econ", decisionRole: "economic" as const, influence: 90, status: "active" },
  ];
  // The buyer HAS been recorded - no judgement, even with no relation edge.
  const met = deriveJudgements({
    accounts: [account({
      contacts,
      relations: [],
      contactActivity: [
        { contactId: "ct_coach", lastContactAt: daysAgo(10) },
        { contactId: "ct_econ", lastContactAt: daysAgo(20) },
      ],
    })],
    now: NOW,
  });
  assert.equal(met.some((j) => j.id === "unreached:acc_1"), false);

  // Never recorded -> it fires.
  const never = deriveJudgements({
    accounts: [account({
      contacts,
      relations: [],
      contactActivity: [{ contactId: "ct_coach", lastContactAt: daysAgo(10) }],
    })],
    now: NOW,
  });
  const j = never.find((x) => x.id === "unreached:acc_1");
  assert.ok(j, "an economic buyer with no recorded contact is a judgement");
  assert.equal(j.urgency, "today");
  assert.equal(j.facts.find((f) => f.label === "其中见决策人")?.value, "0");
});

test("our own broken promise is its own judgement, never folded into theirs", () => {
  // It is the one kind of problem this team can fix without anyone else's
  // cooperation, so it must not be averaged into a relationship score.
  const js = deriveJudgements({
    accounts: [account({
      lastContactAt: daysAgo(3),
      commitments: [{ id: "cm_us", direction: "we_owe", status: "open", statement: "提供试点数据", dueAt: daysAgo(9) }],
    })],
    now: NOW,
  });
  const ours = js.find((j) => j.id === "weowe:acc_1");
  assert.ok(ours);
  assert.equal(ours.urgency, "today", "9 days late is today's problem");
  assert.match(ours.claim, /提供试点数据/);
});

test("a fresh miss is this week, a stale one is today", () => {
  const fresh = deriveJudgements({
    accounts: [account({
      lastContactAt: daysAgo(3),
      commitments: [{ id: "c", direction: "we_owe", status: "open", statement: "x", dueAt: daysAgo(2) }],
    })],
    now: NOW,
  });
  assert.equal(fresh.find((j) => j.id === "weowe:acc_1")?.urgency, "week");
});

test("the team metric gets no analysis buttons", () => {
  // A competitor scan on an adoption metric would be a button that exists for
  // symmetry. This product does not put buttons where there is nothing behind
  // them.
  const weeks = Array.from({ length: 6 }, (_u, i) => ({
    weekStart: new Date(NOW.getTime() - (6 - i) * 7 * 86_400_000),
    weekEnd: new Date(NOW.getTime() - (5 - i) * 7 * 86_400_000),
    complete: true,
    opportunities: 6,
    interactions: 2,
    covered: 2,
    coverage: 2 / 6,
    rate: 2 / 6,
  }));
  const js = deriveJudgements({
    accounts: [],
    captureWeeks: weeks,
    now: NOW,
  });
  const team = js.find((j) => j.id === "capture:team");
  assert.ok(team);
  assert.deepEqual([...team.analyses], []);
  assert.equal(team.urgency, "watch");

  // Object judgements DO get them.
  const obj = deriveJudgements({ accounts: [account({ commitments: [theyOwe(41)] })], now: NOW });
  assert.ok(obj.find((j) => j.id === "stalled:acc_1")!.analyses.length > 0);
});

test("nothing to say produces nothing, rather than a reassuring empty card", () => {
  const js = deriveJudgements({
    accounts: [account({ lastContactAt: daysAgo(2), openDeals: [], commitments: [] })],
    now: NOW,
  });
  assert.deepEqual(js, []);
});

test("results are ordered by tier, so the top of the list is the top tier", () => {
  const js = deriveJudgements({
    accounts: [
      account({ accountId: "a", accountName: "安静", lastContactAt: daysAgo(25) }),
      account({ accountId: "b", accountName: "破约", commitments: [theyOwe(41)] }),
    ],
    now: NOW,
  });
  assert.equal(js[0].urgency, "today");
  const counts = countByUrgency(js);
  assert.equal(counts.today, 1);
  assert.ok(counts.week + counts.watch >= 1);
});

test("every judgement carries which kind it is", () => {
  const js = deriveJudgements({ accounts: [account({ commitments: [theyOwe(41)] })], now: NOW });
  assert.ok(js.length > 0);
  // Everything this module makes is a rule. Model judgements never originate
  // here - they cost money and only exist when someone asks.
  assert.ok(js.every((j) => j.source === "rule"));
});

// The defect this locks down shipped once: the home screen hardcoded "mine",
// so every leader-shaped role opened the product on an empty stream with the
// data one filter away. Nothing went red - an empty list is a valid render.
test("an explicit scope always wins over the derivation", () => {
  assert.equal(resolveScope("mine", 5), "mine");
  assert.equal(resolveScope("all", 5), "all");
  // Including the case that looks pointless: asking for "mine" while owning
  // nothing is a reader choosing to see their own empty book, and the filter
  // control has to keep meaning what it says.
  assert.equal(resolveScope("mine", 0), "mine");
});

test("owning nothing defaults to the team rather than to an empty screen", () => {
  assert.equal(resolveScope(undefined, 0), "all");
});

test("owning accounts defaults to your own book", () => {
  assert.equal(resolveScope(undefined, 1), "mine");
});

// The snooze rule, held still where it can be read.
//
// This is the whole safety argument for the 不用管 button: a judgement id is
// derived, so deferring one defers a CONCLUSION that will be reached again from
// worse facts. Comparing tiers is what stops "not now" becoming "never".
test("a snooze holds while the tier is unchanged and breaks when it escalates", () => {
  const rank: Record<string, number> = { watch: 0, week: 1, today: 2 };
  const held = (current: string, at: string) => rank[current] > rank[at];

  // Same situation: stays deferred.
  assert.equal(held("week", "week"), false);
  // It got worse: comes back, whatever the timer said.
  assert.equal(held("today", "week"), true);
  assert.equal(held("today", "watch"), true);
  assert.equal(held("week", "watch"), true);
  // It improved: staying deferred is correct - nothing new to decide.
  assert.equal(held("watch", "today"), false);
});

// ADR-013. This is the whole point of the strategic tier, so it is pinned here
// rather than left to the shape of whatever demo data happens to exist.
const plan = (over: Partial<NonNullable<AccountInput["plan"]>> = {}) => ({
  period: "2026Q3",
  contactCadenceDays: 30,
  execCadenceDays: 90,
  lastExecContactAt: daysAgo(20),
  ...over,
});

test("the cadence rule fires with NO open opportunity - every other rule cannot", () => {
  const bare = account({ openDeals: [], commitments: [], plan: plan({ lastExecContactAt: daysAgo(200) }) });
  const js = deriveJudgements({ accounts: [bare], now: NOW });

  // Nothing else can speak: the other four rules all require an open deal.
  assert.equal(js.filter((j) => j.id.startsWith("quiet:")).length, 0);
  assert.equal(js.filter((j) => j.id.startsWith("stalled:")).length, 0);

  const cadence = js.find((j) => j.id === "cadence:acc_1");
  assert.ok(cadence, "a strategic account with no deal and no contact must still be reported");
  // The executive gap outranks the ordinary one: contact can be delegated,
  // and a plan that never reached a decision-maker is not being worked.
  assert.equal(cadence!.urgency, "today");
  // There is nothing to quote. The evidence IS the silence.
  assert.deepEqual([...cadence!.citations], []);
});

test("a strategic account inside its cadence produces nothing", () => {
  const healthy = account({
    openDeals: [],
    commitments: [],
    lastContactAt: daysAgo(5),
    plan: plan({ lastExecContactAt: daysAgo(10) }),
  });
  assert.deepEqual(deriveJudgements({ accounts: [healthy], now: NOW }), []);
});

test("a decision-maker never met is late by definition, not missing data", () => {
  const never = account({
    openDeals: [],
    commitments: [],
    lastContactAt: daysAgo(3),
    plan: plan({ lastExecContactAt: null }),
  });
  const j = deriveJudgements({ accounts: [never], now: NOW }).find((x) => x.id === "cadence:acc_1");
  assert.ok(j, "never having met the decision maker is the worse case, not the absent one");
  assert.equal(j!.urgency, "today");
});

test("a non-strategic account gets no cadence judgement at all", () => {
  const ordinary = account({ openDeals: [], commitments: [], lastContactAt: daysAgo(400) });
  const js = deriveJudgements({ accounts: [ordinary], now: NOW });
  assert.equal(js.filter((j) => j.id.startsWith("cadence:")).length, 0);
});
