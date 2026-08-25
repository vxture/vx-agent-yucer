import assert from "node:assert/strict";
import { test } from "node:test";
import { coverage, resolveCoverageFloor, DEFAULT_COVERAGE_FLOOR } from "./coverage";

test("coverage measures the pool against the GAP, not the whole target", () => {
  // Half the target is already banked, so only half of it still needs covering.
  const c = coverage(600, 1200, 600);
  assert.equal(c.gap, 600);
  assert.equal(c.ratio, 1);
  // Against the whole target this would read 0.5 and look like a warning; the
  // rep has in fact got exactly enough pipeline for what is left.
  assert.equal(c.thin, false);
});

test("a pool the same size as the gap is not comfortable, but it is not thin", () => {
  const c = coverage(930, 1200, 270);
  assert.equal(c.gap, 930);
  assert.equal(c.ratio, 1);
  assert.equal(c.thin, false, "1.0 is above the 0.5 floor");
});

test("thin is reported strictly below the floor", () => {
  assert.equal(coverage(464, 1200, 270).thin, true, "0.499 is below 0.5");
  assert.equal(coverage(465, 1200, 270).thin, false, "0.5 exactly is not below");
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

test("an empty pipeline against a real gap is thin", () => {
  const c = coverage(0, 1200, 0);
  assert.equal(c.ratio, 0);
  assert.equal(c.thin, true);
});

test("the floor is configurable and reported back", () => {
  const strict = coverage(930, 1200, 270, 1.5);
  assert.equal(strict.thin, true, "1.0 coverage is thin when 1.5 is required");
  assert.equal(strict.floor, 1.5, "the surface can name what it judged against");
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
