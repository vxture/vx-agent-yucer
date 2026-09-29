import { test } from "node:test";
import assert from "node:assert/strict";
import { permissionsForRoles } from "../../authz/catalog";
import { EMPTY_ENTITLEMENT, type Entitlement } from "../../entitlement/types";
import { NAV_ENTRIES, moduleIcon, resolveNavigation } from "./navigation";
import { upgradeTarget } from "./upgrade";
import { UPGRADE_TEXT } from "./messages";

// 高级功能升级页: every fact is the gate's and the matrix's.

const owner = { permissions: new Set(permissionsForRoles(["workspace_owner"])) };
const at = (tier: Entitlement["tier"]): Entitlement => ({ ...EMPTY_ENTITLEMENT, workspace_id: "w", product: "yucer", tier });

test("a locked module names the tier that opens it, and what else that tier brings", () => {
  const t = upgradeTarget("forecastRule", owner, at("starter"));
  assert.ok(t);
  assert.equal(t.href, "/forecast");
  assert.equal(t.currentTier, "starter");
  assert.equal(t.requiredTier, "pro");
  assert.deepEqual(t.viaTiers, []);
  // PRO's own additions, minus pipeline.forecast itself.
  assert.deepEqual([...t.alsoUnlocks].sort(), ["account.graph", "copilot.suggest", "planning.target", "planning.territory", "signal.autoscore"]);
});

test("a two-tier jump reads the tier in between as a whole, then only what the target adds", () => {
  const t = upgradeTarget("winLossReview", owner, at("starter"));
  assert.ok(t);
  assert.equal(t.requiredTier, "business");
  assert.deepEqual(t.viaTiers, ["pro"]);
  assert.ok(!t.alsoUnlocks.includes("pipeline.winloss"), "not itself");
  assert.ok(!t.alsoUnlocks.includes("pipeline.forecast"), "PRO's features are in 'all of PRO'");
  assert.ok(t.alsoUnlocks.includes("delivery.revenue"));
});

test("an open module and an unknown key are not upgrade pages", () => {
  assert.equal(upgradeTarget("forecastRule", owner, at("pro")), null);
  assert.equal(upgradeTarget("nonsense", owner, at("free")), null);
});

test("the tier is asked first, exactly as the launcher asks it", () => {
  // Entitlement before permission (CLAUDE.md, two gates): a member without
  // the permission still sees the module locked by tier, in the launcher and
  // here alike - the two cannot disagree about the same row.
  const none = { permissions: new Set<string>() } as never;
  const row = resolveNavigation(none, at("starter")).find((e) => e.key === "forecastRule");
  assert.equal(row?.state, "locked");
  assert.equal(upgradeTarget("forecastRule", none, at("starter"))?.requiredTier, "pro");
});

test("every module a free workspace sees locked - launcher or admin plane - has its own copy", () => {
  const known = new Set(NAV_ENTRIES.map((e) => e.key));
  const locked = resolveNavigation(owner, at("free"))
    .filter((e) => e.state === "locked" && known.has(e.key))
    .map((e) => e.key);
  assert.ok(locked.includes("division"), "区域设置 locks by tier too");
  assert.ok(locked.length >= 10, `expected the tier-gated modules, found ${locked.length}`);
  const missing = locked.filter((k) => !UPGRADE_TEXT.module[k]);
  assert.deepEqual(missing, [], `no upgrade copy for: ${missing.join(", ")}`);
});

test("every entry's headline icon resolves - the template renders any of them", () => {
  // /upgrade/strategyDiag threw in production: moduleIcon read only some tables.
  const broken = NAV_ENTRIES.filter((e) => {
    try {
      moduleIcon(e.key);
      return false;
    } catch {
      return true;
    }
  }).map((e) => e.key);
  assert.deepEqual(broken, []);
});
