import { test } from "node:test";
import assert from "node:assert/strict";
import { getOidcConfig } from "./config";

// appOrigin falls back to the redirect URI's origin when NEXT_PUBLIC_APP_URL is
// unset. The platform registered /api/auth/oidc/callback (2026-09-14), so the
// derivation must strip that path as well as the contract's /auth/callback -
// otherwise every post-login redirect would carry the callback path.

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("appOrigin derives from the registered redirect path", () => {
  withEnv({ NEXT_PUBLIC_APP_URL: undefined, OIDC_REDIRECT_URI: "https://yucer.vxture.com/api/auth/oidc/callback" }, () => {
    assert.equal(getOidcConfig().appOrigin, "https://yucer.vxture.com");
  });
});

test("appOrigin still derives from the contract redirect path", () => {
  withEnv({ NEXT_PUBLIC_APP_URL: undefined, OIDC_REDIRECT_URI: "https://yucer.vxture.com/auth/callback" }, () => {
    assert.equal(getOidcConfig().appOrigin, "https://yucer.vxture.com");
  });
});

test("an explicit NEXT_PUBLIC_APP_URL wins over the derivation", () => {
  withEnv({ NEXT_PUBLIC_APP_URL: "https://beta.example", OIDC_REDIRECT_URI: "https://yucer.vxture.com/api/auth/oidc/callback" }, () => {
    assert.equal(getOidcConfig().appOrigin, "https://beta.example");
  });
});
