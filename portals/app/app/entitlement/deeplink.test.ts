import { test } from "node:test";
import assert from "node:assert/strict";
import { intentFor, subscribeUrl } from "./deeplink";
import { makeEntitlement } from "./resolver";

test("subscribe URL carries product + intent and never workspace_id", () => {
  const u = new URL(subscribeUrl({ intent: "upgrade", targetTier: "pro", metric: "member.max" }));
  assert.equal(u.pathname, "/subscribe");
  assert.equal(u.searchParams.get("intent"), "upgrade");
  assert.equal(u.searchParams.get("target_tier"), "pro");
  assert.equal(u.searchParams.get("metric"), "member.max");
  assert.notEqual(u.searchParams.get("product"), null);
  assert.equal(u.searchParams.get("workspace_id"), null);
});

test("optional params omitted when not given", () => {
  const u = new URL(subscribeUrl({ intent: "renew" }));
  assert.equal(u.searchParams.get("intent"), "renew");
  assert.equal(u.searchParams.get("target_tier"), null);
  assert.equal(u.searchParams.get("metric"), null);
});

test("subscribe is a first-class intent - a never-subscribed workspace is not an upgrade from nothing", () => {
  const u = new URL(subscribeUrl({ intent: "subscribe" }));
  assert.equal(u.searchParams.get("intent"), "subscribe");
});

test("intentFor follows the CTA branch: null -> subscribe, lapsed -> renew, good standing -> upgrade", () => {
  const ws = "ws_1";
  assert.equal(intentFor(makeEntitlement(ws, "yucer")), "subscribe"); // status null, tier null
  for (const status of ["expired", "cancelled", "suspended"] as const) {
    assert.equal(intentFor(makeEntitlement(ws, "yucer", { status })), "renew", status);
  }
  assert.equal(intentFor(makeEntitlement(ws, "yucer", { status: "overdue" })), "renew");
  assert.equal(intentFor(makeEntitlement(ws, "yucer", { status: "active", tier: "pro" })), "upgrade");
  assert.equal(intentFor(makeEntitlement(ws, "yucer", { status: "trialing", tier: "starter" })), "upgrade");
});
