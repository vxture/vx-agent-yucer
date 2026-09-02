import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPair, SignJWT, exportJWK } from "jose";
import { exchangeCode, refreshTokens, verifyToken } from "./oidc";
import type { OidcConfig } from "./config";

// The half of oidc.ts that talks to the IdP: exchangeCode, refreshTokens, the
// postToken they share, the basicAuth header it carries, and the remote-JWKS
// path getJwks builds.
//
// AGAINST A REAL HTTP SERVER, not a stubbed global fetch, for the same reason
// the store tests run against a real Postgres rather than the in-memory mirror.
// A stub can only confirm what this file THINKS it sent; the thing that matters
// at an integration point is what a server actually RECEIVES - the method, the
// content type, which fields are in the form, and above all which are not. The
// client secret belonging in the Authorization header and nowhere else is a
// property of the bytes on the wire, and a fetch stub asserts it by agreeing
// with the code that wrote it.
//
// Needs no DATABASE_URL and no network: the IdP is a node:http server on
// 127.0.0.1 with an ephemeral port, so these run in the ordinary suite.

const ISSUER = "https://accounts.vxture.com";
const CLIENT = "testclient";
const SECRET = "s3cr3t";

interface Received {
  method: string;
  url: string;
  headers: NodeJS.Dict<string | string[]>;
  body: string;
}

interface Idp {
  origin: string;
  received: Received[];
  close(): Promise<void>;
}

/** A throwaway IdP on an ephemeral port. */
async function startIdp(handler: (req: Received, res: ServerResponse) => void): Promise<Idp> {
  const received: Received[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const entry: Received = {
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      received.push(entry);
      handler(entry, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function json(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}

function configFor(origin: string, over: Partial<OidcConfig> = {}): OidcConfig {
  return {
    issuer: ISSUER,
    clientId: CLIENT,
    clientSecret: SECRET,
    redirectUri: "https://app.example/auth/callback",
    postLogoutRedirectUri: "",
    scopes: "openid",
    enabled: true,
    sessionTtlSeconds: 3600,
    cookieName: "vx_rp_session",
    appOrigin: "https://app.example",
    authorizeUrl: `${ISSUER}/oidc/authorize`,
    tokenUrl: `${origin}/oidc/token`,
    jwksUrl: `${origin}/oidc/jwks`,
    endSessionUrl: `${ISSUER}/oidc/end_session`,
    ...over,
  };
}

const TOKEN_RESPONSE = {
  access_token: "at_1",
  id_token: "it_1",
  refresh_token: "rt_1",
  token_type: "Bearer",
  expires_in: 3600,
  scope: "openid profile",
};

// --- the authorization_code exchange ---------------------------------------

test("exchangeCode posts the authorization_code grant and returns the parsed token set", async () => {
  const idp = await startIdp((_req, res) => json(res, 200, TOKEN_RESPONSE));
  try {
    const cfg = configFor(idp.origin);
    const tokens = await exchangeCode(cfg, "the-code", "the-verifier");

    assert.deepEqual(tokens, TOKEN_RESPONSE);
    assert.equal(idp.received.length, 1);
    const sent = idp.received[0];
    assert.equal(sent.method, "POST");
    assert.equal(sent.url, "/oidc/token");

    const form = new URLSearchParams(sent.body);
    assert.equal(form.get("grant_type"), "authorization_code");
    assert.equal(form.get("code"), "the-code");
    assert.equal(form.get("code_verifier"), "the-verifier");
    assert.equal(form.get("redirect_uri"), cfg.redirectUri);
  } finally {
    await idp.close();
  }
});

test("the client secret travels in the Authorization header and NOWHERE else", async () => {
  // The property worth a real server. A secret that also appeared in the form
  // would be logged by every proxy and access log between here and the IdP,
  // and no assertion written against a fetch stub would notice - it would be
  // agreeing with the same code that put it there.
  const idp = await startIdp((_req, res) => json(res, 200, TOKEN_RESPONSE));
  try {
    const cfg = configFor(idp.origin);
    await exchangeCode(cfg, "the-code", "the-verifier");
    const sent = idp.received[0];

    assert.equal(
      sent.headers.authorization,
      "Basic " + Buffer.from(`${CLIENT}:${SECRET}`).toString("base64"),
    );
    assert.ok(!sent.body.includes(SECRET), "the secret must not be in the form body");
    const form = new URLSearchParams(sent.body);
    assert.equal(form.get("client_secret"), null);
    assert.equal(form.get("client_id"), null);
  } finally {
    await idp.close();
  }
});

test("a secret with regex- and url-significant characters survives the header intact", async () => {
  // base64 of the raw `id:secret`, not of anything url-encoded. A secret with
  // `+`, `/` or `=` in it is exactly where a hand-rolled encoding goes wrong.
  const awkward = "p+a/s=s:word";
  const idp = await startIdp((_req, res) => json(res, 200, TOKEN_RESPONSE));
  try {
    const cfg = configFor(idp.origin, { clientSecret: awkward });
    await refreshTokens(cfg, "rt");
    const header = String(idp.received[0].headers.authorization);
    const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf8");
    assert.equal(decoded, `${CLIENT}:${awkward}`);
  } finally {
    await idp.close();
  }
});

test("the request is form-encoded and asks for json", async () => {
  const idp = await startIdp((_req, res) => json(res, 200, TOKEN_RESPONSE));
  try {
    await exchangeCode(configFor(idp.origin), "c", "v");
    const h = idp.received[0].headers;
    assert.match(String(h["content-type"]), /^application\/x-www-form-urlencoded/);
    assert.equal(h.accept, "application/json");
  } finally {
    await idp.close();
  }
});

// --- the refresh grant -------------------------------------------------------

test("refreshTokens posts the refresh grant and carries no leftovers from the code flow", async () => {
  // The two grants share postToken, so the risk is one of them quietly sending
  // the other's fields. An IdP is entitled to reject a refresh that arrives
  // with a code_verifier attached.
  const idp = await startIdp((_req, res) => json(res, 200, TOKEN_RESPONSE));
  try {
    const tokens = await refreshTokens(configFor(idp.origin), "the-refresh-token");
    assert.equal(tokens.access_token, "at_1");

    const form = new URLSearchParams(idp.received[0].body);
    assert.equal(form.get("grant_type"), "refresh_token");
    assert.equal(form.get("refresh_token"), "the-refresh-token");
    assert.equal(form.get("code"), null);
    assert.equal(form.get("code_verifier"), null);
    assert.equal(form.get("redirect_uri"), null);
  } finally {
    await idp.close();
  }
});

test("a token response without the optional fields is still a token set", async () => {
  const idp = await startIdp((_req, res) =>
    json(res, 200, { access_token: "at_only", token_type: "Bearer" }),
  );
  try {
    const tokens = await refreshTokens(configFor(idp.origin), "rt");
    assert.equal(tokens.access_token, "at_only");
    assert.equal(tokens.refresh_token, undefined);
    assert.equal(tokens.id_token, undefined);
  } finally {
    await idp.close();
  }
});

// --- failures ----------------------------------------------------------------

test("a refused grant throws with the status and the IdP's explanation", async () => {
  const idp = await startIdp((_req, res) =>
    json(res, 400, { error: "invalid_grant", error_description: "code already used" }),
  );
  try {
    await assert.rejects(
      () => exchangeCode(configFor(idp.origin), "used-code", "v"),
      (e: Error) => {
        assert.match(e.message, /token endpoint 400/);
        assert.match(e.message, /invalid_grant/, "the IdP's own reason must survive into the error");
        return true;
      },
    );
  } finally {
    await idp.close();
  }
});

test("a 500 from the IdP is an error here, not an empty token set", async () => {
  const idp = await startIdp((_req, res) => {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("upstream exploded");
  });
  try {
    await assert.rejects(
      () => refreshTokens(configFor(idp.origin), "rt"),
      /token endpoint 500: upstream exploded/,
    );
  } finally {
    await idp.close();
  }
});

test("a huge error body is truncated rather than carried whole into the message", async () => {
  // `.slice(0, 200)`. An IdP that answers an error with an HTML page should not
  // put that page into an exception message, a log line and a stack trace.
  const idp = await startIdp((_req, res) => {
    res.writeHead(502, { "content-type": "text/html" });
    res.end("x".repeat(5000));
  });
  try {
    await assert.rejects(
      () => refreshTokens(configFor(idp.origin), "rt"),
      (e: Error) => {
        assert.match(e.message, /^token endpoint 502: x+$/);
        assert.equal(e.message.length, "token endpoint 502: ".length + 200);
        return true;
      },
    );
  } finally {
    await idp.close();
  }
});

test("an error whose body cannot be read still reports the status, not a network error", async () => {
  // The `.catch(() => "")` on res.text(). The IdP promises 1000 bytes, sends a
  // few and drops the socket, so reading the body rejects. Without the catch
  // that rejection would replace the exception entirely and the caller would
  // get "terminated" instead of 503 - losing the one fact worth having.
  const idp = await startIdp((_req, res) => {
    res.writeHead(503, { "content-length": "1000", "content-type": "text/plain" });
    res.write("partial");
    // The headers have to land first: destroying before fetch resolves its
    // Response fails the whole call, which is a DIFFERENT path (the rejection
    // replaces the exception rather than being caught by it).
    //
    // THE ONE TIMING DEPENDENCY IN THIS FILE, named rather than hidden. The
    // margin is 250ms against a loopback round trip that takes well under one,
    // so it is wide by roughly three orders of magnitude. If this ever does
    // flake on a loaded runner it will fail as "fetch failed" rather than
    // silently passing - and the fix is a wider margin, not a retry.
    setTimeout(() => res.socket?.destroy(), 250);
  });
  try {
    await assert.rejects(
      () => refreshTokens(configFor(idp.origin), "rt"),
      (e: Error) => {
        assert.match(e.message, /^token endpoint 503: /, e.message);
        return true;
      },
    );
  } finally {
    await idp.close();
  }
});

// --- the remote JWKS path ------------------------------------------------------

async function signedBy(privateKey: Parameters<typeof SignJWT.prototype.sign>[0], kid: string) {
  return new SignJWT({ sub: "usr_remote" })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(ISSUER)
    .setAudience(CLIENT)
    .setExpirationTime("5m")
    .sign(privateKey);
}

test("verifyToken with no injected key fetches the IdP's JWKS and verifies against it", async () => {
  // Every other test in this directory hands verifyToken a public key, so the
  // resolver getJwks builds - the one production actually uses - had never run.
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: "remote-1", alg: "RS256", use: "sig" };
  let jwksHits = 0;
  const idp = await startIdp((req, res) => {
    if (req.url === "/oidc/jwks") {
      jwksHits += 1;
      return json(res, 200, { keys: [jwk] });
    }
    return json(res, 404, {});
  });
  try {
    const cfg = configFor(idp.origin);
    const payload = await verifyToken(await signedBy(privateKey, "remote-1"), cfg);
    assert.equal(payload.sub, "usr_remote");
    assert.equal(jwksHits, 1, "the key set must actually have been fetched");
  } finally {
    await idp.close();
  }
});

test("the fetched key set is cached, so a second verify does not re-fetch it", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: "cached-1", alg: "RS256", use: "sig" };
  let jwksHits = 0;
  const idp = await startIdp((req, res) => {
    if (req.url === "/oidc/jwks") {
      jwksHits += 1;
      return json(res, 200, { keys: [jwk] });
    }
    return json(res, 404, {});
  });
  try {
    const cfg = configFor(idp.origin);
    await verifyToken(await signedBy(privateKey, "cached-1"), cfg);
    await verifyToken(await signedBy(privateKey, "cached-1"), cfg);
    assert.equal(jwksHits, 1, "a token per request must not mean a JWKS fetch per request");
  } finally {
    await idp.close();
  }
});

test("the cache is keyed on the JWKS url, so a different IdP is not served the old keys", async () => {
  // The cache is a module-level single slot. If it ignored the url, pointing at
  // a second IdP would verify its tokens against the first one's keys - which
  // fails closed here, but only because the keys differ; the bug would be a
  // stale key set surviving a config change.
  const a = await generateKeyPair("RS256", { extractable: true });
  const b = await generateKeyPair("RS256", { extractable: true });
  const serve = async (pair: typeof a, kid: string) => {
    const jwk = { ...(await exportJWK(pair.publicKey)), kid, alg: "RS256", use: "sig" };
    return startIdp((req, res) =>
      req.url === "/oidc/jwks" ? json(res, 200, { keys: [jwk] }) : json(res, 404, {}),
    );
  };
  const idpA = await serve(a, "key-a");
  const idpB = await serve(b, "key-b");
  try {
    assert.equal((await verifyToken(await signedBy(a.privateKey, "key-a"), configFor(idpA.origin))).sub, "usr_remote");
    // Second IdP, different keys: resolved from ITS jwks url, not from the slot
    // the first one left behind.
    assert.equal((await verifyToken(await signedBy(b.privateKey, "key-b"), configFor(idpB.origin))).sub, "usr_remote");
  } finally {
    await idpA.close();
    await idpB.close();
  }
});

test("the RS256 allowlist still holds on the remote path, not only with an injected key", async () => {
  // The alg downgrade test elsewhere in this directory injects a key. This is
  // the same guarantee on the code path production runs.
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: "alg-1", alg: "RS256", use: "sig" };
  const idp = await startIdp((req, res) =>
    req.url === "/oidc/jwks" ? json(res, 200, { keys: [jwk] }) : json(res, 404, {}),
  );
  try {
    const cfg = configFor(idp.origin);
    const hs = await new SignJWT({ sub: "usr_downgrade" })
      .setProtectedHeader({ alg: "HS256", kid: "alg-1" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT)
      .setExpirationTime("5m")
      .sign(new Uint8Array(32));
    await assert.rejects(() => verifyToken(hs, cfg));

    // And the good token still passes, so the rejection above is the algorithm
    // and not a broken fixture.
    assert.equal((await verifyToken(await signedBy(privateKey, "alg-1"), cfg)).sub, "usr_remote");
  } finally {
    await idp.close();
  }
});
