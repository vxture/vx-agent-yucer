import { test } from "node:test";
import assert from "node:assert/strict";
import { icpFit, type IcpSegment } from "./icp";

const seg = (code: string, priority: number, criteria: IcpSegment["criteria"], status: IcpSegment["status"] = "active"): IcpSegment => ({
  segmentCode: code,
  name: code,
  priority,
  status,
  criteria,
});

test("three features against the best segment, each with its own status", () => {
  const r = icpFit({ industry: "零售", customerSize: "大型", region: "华南" }, [
    seg("east_retail", 1, { industries: ["零售"], regions: ["华东"], sizes: ["大型"] }),
    seg("mfg", 2, { industries: ["制造"], regions: [], sizes: [] }),
  ]);
  assert.equal(r?.segmentCode, "east_retail");
  assert.equal(r?.fit, 2);
  assert.deepEqual(r?.features.map((f) => [f.dimension, f.status]), [["industry", "hit"], ["size", "hit"], ["region", "miss"]]);
});

test("a dimension the segment leaves open fits; an empty field is a gap in our record, not a miss", () => {
  const r = icpFit({ industry: "零售", customerSize: null, region: null }, [
    seg("retail", 1, { industries: ["零售"], regions: [], sizes: ["大型"] }),
  ]);
  assert.deepEqual(r?.features.map((f) => f.status), ["hit", "missing_value", "open"]);
  assert.equal(r?.fit, 2);
});

test("ties go to the segment the workspace ranked first; paused and empty segments are no ICP", () => {
  const a = { industry: "零售", customerSize: null, region: null };
  assert.equal(
    icpFit(a, [seg("second", 5, { industries: ["零售"], regions: [] }), seg("first", 1, { industries: ["零售"], regions: [] })])?.segmentCode,
    "first",
  );
  assert.equal(icpFit(a, [seg("paused", 1, { industries: ["零售"], regions: [] }, "paused")]), null);
  assert.equal(icpFit(a, [seg("blank", 1, { industries: [], regions: [], sizes: [] })]), null);
});
