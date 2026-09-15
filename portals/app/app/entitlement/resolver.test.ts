import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getEntitlementResolver, MockEntitlementResolver, resetResolver } from "./resolver";
import { PlatformEntitlementResolver } from "./platform-resolver";

// Which resolver the factory hands out, by stage and by configuration. The
// mock is a local-dev convenience; on a deployed stage it is a misconfiguration
// the factory must refuse, not a fallback it may take quietly.

const KEYS = ["DEPLOY_STAGE", "ALLOW_MOCK_ON_DEPLOY", "PLATFORM_API_URL", "PLATFORM_INTERNAL_AUTH_TOKEN"] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

function env(vars: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const k of KEYS) {
    const v = vars[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  resetResolver();
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("dev without platform config hands out the mock", () => {
  env({ DEPLOY_STAGE: "dev" });
  resetResolver();
  assert.ok(getEntitlementResolver() instanceof MockEntitlementResolver);
});

test("a deployed stage without platform config refuses to build a resolver at all", () => {
  for (const stage of ["production", "beta"]) {
    env({ DEPLOY_STAGE: stage });
    resetResolver();
    assert.throws(() => getEntitlementResolver(), /refusing to start on stage/, stage);
  }
});

test("ALLOW_MOCK_ON_DEPLOY=on is the loud override on a deployed stage", () => {
  env({ DEPLOY_STAGE: "production", ALLOW_MOCK_ON_DEPLOY: "on" });
  resetResolver();
  assert.ok(getEntitlementResolver() instanceof MockEntitlementResolver);
});

test("platform config wins on any stage, override or not", () => {
  env({ DEPLOY_STAGE: "production", PLATFORM_API_URL: "https://platform.internal", PLATFORM_INTERNAL_AUTH_TOKEN: "t" });
  resetResolver();
  assert.ok(getEntitlementResolver() instanceof PlatformEntitlementResolver);
});

test("the factory memoizes: the same instance comes back until reset", () => {
  env({ DEPLOY_STAGE: "dev" });
  resetResolver();
  assert.equal(getEntitlementResolver(), getEntitlementResolver());
});
