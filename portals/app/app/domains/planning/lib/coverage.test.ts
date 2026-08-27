import assert from "node:assert/strict";
import { test } from "node:test";
import { coverage, resolveCoverageFloor, DEFAULT_COVERAGE_FLOOR } from "./coverage";

test("coverage measures the pool against the GAP, not the whole target", () => {
  // Half the target is already banked, so only half of it still needs covering.
  const c = coverage(1800, 1200, 600);
  assert.equal(c.gap, 600, "600 left, not the full 1200");
  assert.equal(c.ratio, 3);
  // Against the whole target this would read 1.5 and warn; the rep has in fact
  // got a full three times what is left.
  assert.equal(c.thin, false);
});

test("a pool the same size as the gap is thin - one deal is not three", () => {
  const c = coverage(930, 1200, 270);
  assert.equal(c.gap, 930);
  assert.equal(c.ratio, 1);
  assert.equal(c.thin, true, "1.0 coverage is far under the 3x line");
});

test("thin is reported strictly below the floor", () => {
  assert.equal(coverage(2789, 1200, 270).thin, true, "2.999x is below 3");
  assert.equal(coverage(2790, 1200, 270).thin, false, "3x exactly is not below");
});

test("a met target asks no coverage question", () => {
  const c = coverage(0, 1200, 1200);
  assert.equal(c.gap, 0);
  assert.equal(c.ratio, null, "not Infinity - there is nothing left to cover");
  assert.equal(c.thin, false, "a met target with no pipeline is not a warning");
});

test("an overshot target behaves like a met one", () => {
  const c = coverage(0, 1200, 1500);
  assert.equal(c.gap, 0);
  assert.equal(c.thin, false);
});

test("the default is the industry line, not a token value", () => {
  assert.equal(DEFAULT_COVERAGE_FLOOR, 3, "a ratio - three times the gap, not 3%");
});

test("an empty pipeline against a real gap is thin", () => {
  const c = coverage(0, 1200, 0);
  assert.equal(c.ratio, 0);
  assert.equal(c.thin, true);
});

test("the floor is configurable and reported back", () => {
  // A team closing four deals in five does not need three times the gap.
  const lenient = coverage(930, 1200, 270, 1);
  assert.equal(lenient.thin, false, "1.0 coverage passes when only 1x is required");
  assert.equal(lenient.floor, 1, "the surface can name what it judged against");
});

test("resolveCoverageFloor falls back rather than accepting nonsense", () => {
  assert.equal(resolveCoverageFloor(undefined), DEFAULT_COVERAGE_FLOOR);
  assert.equal(resolveCoverageFloor(""), DEFAULT_COVERAGE_FLOOR);
  assert.equal(resolveCoverageFloor("  "), DEFAULT_COVERAGE_FLOOR);
  assert.equal(resolveCoverageFloor("abc"), DEFAULT_COVERAGE_FLOOR);
  // Zero would make the warning unreachable, negative would make it permanent.
  assert.equal(resolveCoverageFloor("0"), DEFAULT_COVERAGE_FLOOR);
  assert.equal(resolveCoverageFloor("-1"), DEFAULT_COVERAGE_FLOOR);
  assert.equal(resolveCoverageFloor("3"), 3);
  assert.equal(resolveCoverageFloor("1.5"), 1.5);
});
