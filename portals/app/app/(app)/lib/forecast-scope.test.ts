import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastScopeKey, parseForecastScope } from "./forecast-scope";

test("the three forms round-trip", () => {
  for (const key of ["workspace", "territory:terr_east", "owner:usr_1"]) {
    assert.equal(forecastScopeKey(parseForecastScope(key)), key);
  }
});

test("a scoped form produces the shape validateScope demands", () => {
  // The domain refuses a territory scope carrying an owner and vice versa, so
  // the parser must not fill both. Asserted rather than assumed: these objects
  // go straight into planSnapshot.
  const t = parseForecastScope("territory:terr_east");
  assert.deepEqual(t, { scopeType: "territory", territoryId: "terr_east", ownerSub: null });
  const o = parseForecastScope("owner:usr_1");
  assert.deepEqual(o, { scopeType: "owner", territoryId: null, ownerSub: "usr_1" });
});

test("anything unrecognised falls back to workspace rather than travelling on", () => {
  // The value reaches a store filter. A hand-edited param is not a query
  // fragment - the same rule resolvePeriod applies to the period.
  for (const bad of [undefined, "", "  ", "team:x", "territory:", "owner:", "'; drop"]) {
    assert.equal(parseForecastScope(bad).scopeType, "workspace", JSON.stringify(bad));
  }
});
