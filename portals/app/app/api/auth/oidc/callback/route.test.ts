import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route";
import { GET as canonical } from "../../../../auth/callback/route";

// /api/auth/oidc/callback is the redirect_uri the platform registered; the
// handler is /auth/callback. The alias must BE the canonical handler, not a
// copy that can drift - and it must reject like it, on the path that needs
// neither the IdP nor Redis (missing code/state is refused before any lookup).

test("the registered path re-exports the canonical callback handler", () => {
  assert.equal(GET, canonical);
});

test("the registered path rejects a bare callback exactly like the canonical one", async () => {
  const res = await GET(new Request("https://yucer.vxture.com/api/auth/oidc/callback"));
  assert.equal(res.status, 400);
  assert.match(await res.text(), /missing code\/state/);
});
