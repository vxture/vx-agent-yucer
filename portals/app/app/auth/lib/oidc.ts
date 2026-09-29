import {
  createRemoteJWKSet,
  decodeJwt,
  jwtVerify,
  type JWTPayload,
  type KeyLike,
  type JWTVerifyGetKey,
} from "jose";
import type { OidcConfig } from "./config";

// Token verification and code/refresh exchange (080-rp section 2.5). All checks
// are mandatory: RS256 only (reject none/HS* downgrade), iss, aud, exp with 60s
// skew. JWKS is fetched by kid and cached (createRemoteJWKSet refreshes on an
// unknown kid). id_token additionally requires a matching nonce (checked by the
// caller, since it is per-request state).

const CLOCK_TOLERANCE_SECONDS = 60;

let jwksCache: {
  url: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
} | null = null;

function getJwks(cfg: OidcConfig) {
  if (!jwksCache || jwksCache.url !== cfg.jwksUrl) {
    jwksCache = { url: cfg.jwksUrl, jwks: createRemoteJWKSet(new URL(cfg.jwksUrl)) };
  }
  return jwksCache.jwks;
}

// A verification key: raw key material (tests inject a local public key) or the
// remote JWKS resolver function.
export type KeyResolver = KeyLike | Uint8Array | JWTVerifyGetKey;

export async function verifyToken(
  token: string,
  cfg: OidcConfig,
  opts: { audience?: string; keyResolver?: KeyResolver } = {},
): Promise<JWTPayload> {
  const key: KeyResolver = opts.keyResolver ?? getJwks(cfg);
  const options = {
    issuer: cfg.issuer,
    audience: opts.audience ?? cfg.clientId,
    algorithms: ["RS256"], // hard allowlist: `none` / HS* are rejected here
    clockTolerance: CLOCK_TOLERANCE_SECONDS,
  };
  // jwtVerify is overloaded on key-material vs getKey-function; branch so each
  // call site matches one overload.
  const { payload } =
    typeof key === "function"
      ? await jwtVerify(token, key, options)
      : await jwtVerify(token, key, options);
  return payload;
}

/**
 * When an access token stops being good, in epoch seconds: the EARLIER of what
 * the token response says (`expires_in`) and what the token itself says (its
 * `exp` claim).
 *
 * The session used to trust `expires_in` alone. If the two ever disagree - a
 * token that lives 10 minutes with a response that says 15 - the refresh is
 * scheduled after the token has already died, and every request in that gap
 * fails verification: signed out on a clock nobody set. The claim is what
 * verifyToken actually enforces, so it is the one to schedule against.
 *
 * `decodeJwt` does NOT verify - fine here, the token came straight from the
 * IdP's token endpoint over TLS and is verified again on every use.
 */
export function accessExpiry(accessToken: string, expiresIn: number | undefined, nowSeconds: number): number {
  // Number() first: an `expires_in` that arrives as "600" must not become
  // now + "600" - the string "1800000000600", a session that never refreshes.
  const seconds = Number(expiresIn);
  const fromResponse = nowSeconds + (Number.isFinite(seconds) && seconds > 0 ? seconds : 300);
  try {
    const exp = decodeJwt(accessToken).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? Math.min(fromResponse, exp) : fromResponse;
  } catch {
    return fromResponse;
  }
}

export interface TokenSet {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}

function basicAuth(cfg: OidcConfig): string {
  return "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
}

export async function exchangeCode(
  cfg: OidcConfig,
  code: string,
  codeVerifier: string,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: codeVerifier,
  });
  return postToken(cfg, body);
}

export async function refreshTokens(cfg: OidcConfig, refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return postToken(cfg, body);
}

async function postToken(cfg: OidcConfig, body: URLSearchParams): Promise<TokenSet> {
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: basicAuth(cfg),
      accept: "application/json",
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`token endpoint ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenSet;
}
