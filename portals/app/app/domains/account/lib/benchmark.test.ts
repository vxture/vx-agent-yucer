import { test } from "node:test";
import assert from "node:assert/strict";
import { peerBenchmark, type BenchmarkRow } from "./benchmark";

const self = { id: "me", industryId: "retail", customerSizeId: "large" };
const peer = (id: string, healthScore: number | null, over: Partial<BenchmarkRow> = {}): BenchmarkRow => ({
  id,
  industryId: "retail",
  customerSizeId: "large",
  healthScore,
  ...over,
});

test("the percentile is among same-industry same-size peers only, self excluded", () => {
  const all = [
    peer("me", 99),
    peer("a", 20), peer("b", 30), peer("c", 40), peer("d", 60), peer("e", 80),
    peer("x", 10, { industryId: "bank" }),
    peer("y", 10, { customerSizeId: "small" }),
  ];
  assert.deepEqual(peerBenchmark(self, 50, all), { kind: "ok", percentile: 60, peers: 5 });
});

test("ties count half, so a tied middle is not the top or the bottom", () => {
  const all = [peer("a", 50), peer("b", 50), peer("c", 50), peer("d", 50), peer("e", 50)];
  assert.equal((peerBenchmark(self, 50, all) as { percentile: number }).percentile, 50);
});

test("too few scored peers says so, with the count, and gives no number", () => {
  const all = [peer("a", 20), peer("b", 30), peer("c", null), peer("d", 60)];
  assert.deepEqual(peerBenchmark(self, 50, all), { kind: "thin", peers: 3, needed: 5 });
});

test("a customer without industry or size has no peer group, and says which is missing", () => {
  assert.deepEqual(peerBenchmark({ id: "me", industryId: null, customerSizeId: null }, 50, []), {
    kind: "unclassified",
    missing: ["industry", "size"],
  });
});
