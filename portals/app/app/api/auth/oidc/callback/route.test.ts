import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";

// /api/auth/oidc/callback (080-rp section 2.3/2.5) is the redirect_uri the
// platform registered for yucer (X-4 step 2, 2026-09-14) and, since X-4
// step 3, the ONLY implementation - there is no longer a separate
// /auth/callback handler this route re-exports.

test("a bare callback (no code/state) is refused before any lookup", async () => {
  const res = await GET(new Request("https://yucer.vxture.com/api/auth/oidc/callback"));
  assert.equal(res.status, 400);
  assert.match(await res.text(), /missing code\/state/);
});

test("a callback with only a state and no code is refused before any lookup", async () => {
  const res = await GET(new Request("https://yucer.vxture.com/api/auth/oidc/callback?state=s1"));
  assert.equal(res.status, 400);
  assert.match(await res.text(), /missing code\/state/);
});

test("a callback with only a code and no state is refused before any lookup", async () => {
  const res = await GET(new Request("https://yucer.vxture.com/api/auth/oidc/callback?code=c1"));
  assert.equal(res.status, 400);
  assert.match(await res.text(), /missing code\/state/);
});
