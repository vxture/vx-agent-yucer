import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT } from "jose";
import { accessExpiry } from "./oidc";

// accessExpiry: the session is scheduled against the EARLIER of the response's
// `expires_in` and the token's own `exp` (see oidc.ts for the incident).

async function token(expSecondsFromNow: number | null, now: number): Promise<string> {
  const { privateKey } = await generateKeyPair("RS256");
  const jwt = new SignJWT({ sub: "u1" }).setProtectedHeader({ alg: "RS256" });
  if (expSecondsFromNow !== null) jwt.setExpirationTime(now + expSecondsFromNow);
  return jwt.sign(privateKey);
}

const NOW = 1_800_000_000;

test("the token's exp wins when it is earlier than expires_in", async () => {
  assert.equal(accessExpiry(await token(600, NOW), 900, NOW), NOW + 600);
});

test("expires_in wins when it is earlier than the token's exp", async () => {
  assert.equal(accessExpiry(await token(900, NOW), 300, NOW), NOW + 300);
});

test("a token with no exp falls back to expires_in", async () => {
  assert.equal(accessExpiry(await token(null, NOW), 300, NOW), NOW + 300);
});

test("something that is not a JWT falls back to expires_in, and a missing expires_in to five minutes", () => {
  assert.equal(accessExpiry("opaque-token", 120, NOW), NOW + 120);
  assert.equal(accessExpiry("opaque-token", undefined, NOW), NOW + 300);
});

test("an expires_in that arrived as a string does not turn the sum into a string", () => {
  // 1800000000 + "600" is "1800000000600" - a session that never refreshes.
  assert.equal(accessExpiry("opaque-token", "600" as unknown as number, NOW), NOW + 600);
});
