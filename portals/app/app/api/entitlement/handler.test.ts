import { test } from "node:test";
import assert from "node:assert/strict";
import { toAuthUser } from "../../auth/lib/claims";
import type { ProductEntryAccess } from "../../auth/product-access";
import { makeEntitlement } from "../../entitlement/resolver";
import { entitlementResponse } from "./handler";

const user = toAuthUser({ sub: "member", active_workspace: "workspace" });
const entitlement = makeEntitlement("workspace", "yucer", { tier: "pro", status: "active" });
const access: ProductEntryAccess = { state: "ready", entitlement, authz: null };
const failed = async () => { throw new Error("private authority details"); };

test("confirmed missing identity or workspace is 401 and never resolves authority", async () => {
  for (const identity of [null, { ...user, activeWorkspace: null }]) {
    let called = false;
    const response = await entitlementResponse(async () => identity, async () => { called = true; return access; });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { authenticated: false });
    assert.equal(called, false);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("identity and authority failures are retryable 503 without anonymous claims or cookie changes", async () => {
  for (const [identity, authority] of [
    [failed, async () => access],
    [async () => user, failed],
    [async () => user, async () => ({ ...access, state: "unavailable" as const })],
  ] as const) {
    const response = await entitlementResponse(identity, authority);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "PRODUCT_ACCESS_UNAVAILABLE", retryable: true });
    assert.equal(response.headers.get("retry-after"), "5");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("seat removal and explicit role removal stay 403 without entitlement or permission details", async () => {
  for (const state of ["unassigned", "no-roles"] as const) {
    const response = await entitlementResponse(async () => user, async () => ({ ...access, state }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { code: "PRODUCT_ACCESS_REQUIRED", productAccess: state });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("commercial product/data formulas preserve direct and bundled-only coverage", async () => {
  for (const [current, state, gates] of [
    [entitlement, "ready", { productAccess: true, dataAccess: true, cta: "none" }],
    [makeEntitlement("workspace", "yucer", { bundled: true }), "no-subscription", { productAccess: false, dataAccess: true, cta: "subscribe" }],
    [makeEntitlement("workspace", "yucer"), "no-subscription", { productAccess: false, dataAccess: false, cta: "subscribe" }],
  ] as const) {
    const response = await entitlementResponse(async () => user, async () => ({ ...access, state, entitlement: current }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { entitlement: current, productAccess: state, gates });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});
