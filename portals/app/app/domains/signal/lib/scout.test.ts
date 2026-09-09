import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clusterByCompany,
  findDuplicates,
  nameKey,
  proposeAccountMatches,
  type ScoutSignal,
} from "./scout";

const day = (n: number) => new Date(Date.UTC(2026, 8, n));

const sig = (over: Partial<ScoutSignal> = {}): ScoutSignal => ({
  id: "sig_1",
  subject: "华东零售集团",
  signalType: "tender",
  accountId: null,
  detectedAt: day(1),
  status: "scored",
  ...over,
});

// --- the comparison key ------------------------------------------------------

test("the key folds whitespace and case, and NOTHING else", () => {
  assert.equal(nameKey(" 华东 零售集团 "), nameKey("华东零售集团"));
  assert.equal(nameKey("ACME Ltd"), nameKey("acme ltd"));
});

test("a legal suffix is part of the name, not noise", () => {
  // Stripping 有限公司 would merge a subsidiary into its parent - the mistake
  // ADR-024 exists to prevent one level up.
  assert.notEqual(nameKey("华东零售集团"), nameKey("华东零售集团有限公司"));
});

// --- duplicates --------------------------------------------------------------

test("the same event reported twice is proposed as a duplicate", () => {
  const d = findDuplicates([
    sig({ id: "a", detectedAt: day(1) }),
    sig({ id: "b", detectedAt: day(3) }),
  ]);
  assert.equal(d.length, 1);
  assert.equal(d[0].keepId, "a", "the earliest is the first report");
  assert.equal(d[0].duplicateId, "b");
  assert.equal(d[0].daysApart, 2);
});

test("far apart is two events, not one reported twice", () => {
  assert.deepEqual(
    findDuplicates([sig({ id: "a", detectedAt: day(1) }), sig({ id: "b", detectedAt: day(28) })]),
    [],
  );
});

test("different types about one company are different events", () => {
  assert.deepEqual(
    findDuplicates([
      sig({ id: "a", signalType: "tender" }),
      sig({ id: "b", signalType: "funding", detectedAt: day(2) }),
    ]),
    [],
  );
});

test("two signals on the same ACCOUNT match even when the names differ", () => {
  // The case a name comparison misses: somebody typed it differently, and the
  // account is what says they are the same company.
  const d = findDuplicates([
    sig({ id: "a", accountId: "acc_1", subject: "华东零售集团" }),
    sig({ id: "b", accountId: "acc_1", subject: "华东零售", detectedAt: day(2) }),
  ]);
  assert.equal(d.length, 1);
});

test("a signal already judged is not proposed again", () => {
  assert.deepEqual(
    findDuplicates([
      sig({ id: "a", status: "promoted" }),
      sig({ id: "b", status: "dismissed", detectedAt: day(2) }),
    ]),
    [],
  );
});

test("three reports of one event give two proposals, both against the earliest", () => {
  const d = findDuplicates([
    sig({ id: "a", detectedAt: day(1) }),
    sig({ id: "b", detectedAt: day(2) }),
    sig({ id: "c", detectedAt: day(3) }),
  ]);
  assert.deepEqual(
    d.map((p) => [p.keepId, p.duplicateId]),
    [["a", "b"], ["a", "c"]],
  );
});

// --- account matching --------------------------------------------------------

const acc = [
  { id: "acc_1", name: "华东零售集团" },
  { id: "acc_2", name: "长江物流" },
];

test("an exact name match is proposed", () => {
  const m = proposeAccountMatches([sig({ id: "s1", subject: " 华东零售集团 " })], acc);
  assert.deepEqual(m, [
    { signalId: "s1", accountId: "acc_1", accountName: "华东零售集团", subject: " 华东零售集团 " },
  ]);
});

test("the customer's name inside a headline is proposed", () => {
  // `subject` is a HEADLINE, not a company name - an equality check would find
  // nothing on real data, which is what the first version of this rule did.
  const m = proposeAccountMatches(
    [sig({ id: "s2", subject: "华东零售集团正在评估 POS 替换方案" })],
    acc,
  );
  assert.equal(m.length, 1);
  assert.equal(m[0].accountId, "acc_1");
});

test("a company nobody has on file is not proposed", () => {
  // Containment, not edit distance: 华南零售集团 must not match 华东零售集团.
  assert.deepEqual(proposeAccountMatches([sig({ subject: "华南零售集团启动招标" })], acc), []);
});

test("an already matched signal is left alone", () => {
  assert.deepEqual(proposeAccountMatches([sig({ accountId: "acc_9" })], acc), []);
});

test("ambiguity is refused, not ranked", () => {
  // Containment makes this likelier than equality would: a headline naming
  // 华东零售集团 also contains 华东零售. Choosing the longer one would be a
  // heuristic nobody asked for, and choosing either is a coin toss the reader
  // cannot see.
  const nested = [
    { id: "acc_a", name: "华东零售集团" },
    { id: "acc_b", name: "华东零售" },
  ];
  assert.deepEqual(
    proposeAccountMatches([sig({ subject: "华东零售集团正在评估 POS 替换方案" })], nested),
    [],
  );
});

test("an account with a blank name is not a wildcard", () => {
  // "" is contained in every string, so an unnamed customer would otherwise
  // match the entire inbox.
  assert.deepEqual(proposeAccountMatches([sig()], [{ id: "acc_x", name: "  " }]), []);
});

// --- clusters ----------------------------------------------------------------

test("several open signals about one company are reported as one story", () => {
  const c = clusterByCompany([
    sig({ id: "a", signalType: "tender", accountId: "acc_1" }),
    sig({ id: "b", signalType: "funding", accountId: "acc_1" }),
    sig({ id: "c", accountId: "acc_2" }),
  ]);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].signalIds, ["a", "b"]);
  assert.deepEqual(c[0].types, ["funding", "tender"]);
});

test("a lone signal is not a cluster", () => {
  assert.deepEqual(clusterByCompany([sig()]), []);
});

test("types are DISTINCT - a noisy feed is not breadth", () => {
  const c = clusterByCompany([
    sig({ id: "a", signalType: "tender", accountId: "acc_1" }),
    sig({ id: "b", signalType: "tender", accountId: "acc_1" }),
  ]);
  assert.deepEqual(c[0].types, ["tender"], "two reports of one kind is one kind");
});

test("the biggest story comes first", () => {
  const c = clusterByCompany([
    sig({ id: "a", accountId: "acc_small" }),
    sig({ id: "b", accountId: "acc_small", signalType: "funding" }),
    sig({ id: "c", accountId: "acc_big" }),
    sig({ id: "d", accountId: "acc_big", signalType: "funding" }),
    sig({ id: "e", accountId: "acc_big", signalType: "hiring" }),
  ]);
  assert.equal(c[0].accountId, "acc_big");
  assert.equal(c[0].signalIds.length, 3);
});

test("unmatched signals do not cluster at all", () => {
  // `subject` is a headline, so grouping on it would only ever join two
  // identically worded reports - which is a duplicate, not a story. An
  // unmatched signal has no reliable identity, and that is why matching it
  // comes first.
  assert.deepEqual(
    clusterByCompany([
      sig({ id: "a", accountId: null, signalType: "tender" }),
      sig({ id: "b", accountId: null, signalType: "funding" }),
    ]),
    [],
  );
});
