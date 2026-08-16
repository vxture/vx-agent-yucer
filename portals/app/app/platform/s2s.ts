// S2S token minting for the two L1 capability platforms yucer consumes.
//
//   Atlas  - the model plane. Every LLM call in the product exits through it.
//   Runos  - the commercial capability plane. Connectors, skills and executors.
//
// Both verify, neither issues: the platform IdP signs the token and each service
// checks issuer / audience / scope / mode / act.sub against its own config. So
// this module's whole job is to ask the IdP for a ticket with the right claims
// and to refuse to proceed when a claim that matters is missing.
//
// THE CLAIM THAT SILENTLY COSTS MONEY: workspace_id. Atlas reads the workspace
// ONLY from the token - there is no body field for it on /v1/chat, and the body
// field on /v1/embed is accepted and then ignored (Atlas TD-035). A token minted
// without workspace_id does not fail: the quota check is skipped entirely and
// usage is metered against a NULL workspace, which drops the traffic out of the
// tenant x workspace pair that is the billing subject. mintS2SToken therefore
// treats a missing workspaceId as a programming error and throws, because a
// throw is the only outcome anyone will notice.

/** Env reader shape. Matches lib/status.ts rather than NodeJS.ProcessEnv:
 * once next-env.d.ts is generated ProcessEnv requires NODE_ENV, so a caller
 * passing a small literal for a test would stop type-checking. These readers
 * only ever look up named keys. */
type EnvLike = Record<string, string | undefined>;

export type Audience = "atlas" | "runos";

/**
 * service = no end user behind the call (scheduled scoring, background jobs).
 * obo     = acting on behalf of a signed-in member; the member's access token is
 *           exchanged, so the downstream audit names a person.
 */
export type TokenMode = "service" | "obo";

export interface S2SRequest {
  audience: Audience;
  mode: TokenMode;
  /** Platform-issued isolation key. Mandatory - see the note above. */
  workspaceId: string;
  /** Platform-issued tenant key. Atlas hard-fails a call without one. */
  tenantId: string;
  /** OBO only: the member's access token, used as the exchange subject token. */
  subjectToken?: string;
}

export interface S2SToken {
  accessToken: string;
  /** Epoch seconds. */
  expiresAt: number;
  audience: Audience;
  mode: TokenMode;
}

export interface S2SConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  /** act.sub of every minted token. Authorization on both platforms hangs on it. */
  productCode: string;
  enabled: boolean;
}

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

/** Scope is derived from the audience; both platforms reject a mismatch. */
export function scopeFor(audience: Audience): string {
  return `tool:${audience}`;
}

export function getS2SConfig(env: EnvLike = process.env): S2SConfig {
  const issuer = (env.OIDC_ISSUER ?? "https://accounts.vxture.com").replace(/\/$/, "");
  const clientId = env.S2S_CLIENT_ID ?? env.OIDC_CLIENT_ID ?? "yucer";
  return {
    tokenUrl: env.S2S_TOKEN_URL ?? `${issuer}/oidc/token`,
    clientId,
    // Per-client secrets are distributed as OIDC_CLIENT_SECRET_<CLIENT>; using
    // the unsuffixed one against a different client_id yields invalid_client,
    // which reads like an environment problem and is not one.
    clientSecret: env.S2S_CLIENT_SECRET ?? env.OIDC_CLIENT_SECRET ?? "",
    productCode: env.PRODUCT_CODE ?? "yucer",
    enabled: Boolean(env.S2S_CLIENT_SECRET ?? env.OIDC_CLIENT_SECRET),
  };
}

export class S2SError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "S2SError";
  }
}

/**
 * Tokens live ~300 seconds. Re-minting on every call would put an IdP round trip
 * in front of every model call and every tool call; caching without a safety
 * margin would hand out a token that expires in flight. 30s of skew is the
 * margin, and the cache key includes everything that changes the claims.
 */
const EXPIRY_SKEW_SECONDS = 30;

const cache = new Map<string, S2SToken>();

function cacheKey(req: S2SRequest): string {
  // The subject token is part of the identity of an OBO ticket, but must not be
  // stored in a key; its tail is enough to separate two members' tickets.
  const subject = req.mode === "obo" ? (req.subjectToken ?? "").slice(-24) : "";

  // JSON, not join("|"). A delimiter that can occur inside a field makes the key
  // non-injective: tenant "a|b" + workspace "c" and tenant "a" + workspace "b|c"
  // produce the same string, and a collision here hands one workspace's
  // credential to another. Platform ids are UUIDs today, so this is unreachable
  // in practice - and it costs nothing to make it unreachable by construction
  // rather than by assumption about someone else's id format.
  return JSON.stringify([req.audience, req.mode, req.tenantId, req.workspaceId, subject]);
}

export function resetS2SCache(): void {
  cache.clear();
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export async function mintS2SToken(
  req: S2SRequest,
  opts: { config?: S2SConfig; fetchImpl?: FetchLike; now?: () => number } = {},
): Promise<S2SToken> {
  const cfg = opts.config ?? getS2SConfig();
  const doFetch = opts.fetchImpl ?? (globalThis.fetch as FetchLike);
  const nowSeconds = () => Math.floor((opts.now?.() ?? Date.now()) / 1000);

  // Refuse rather than degrade. Both of these produce a token that "works" and
  // meters to the wrong place, which is the failure mode nobody reports.
  if (!req.workspaceId) {
    throw new S2SError(
      "workspaceId is required: Atlas reads the workspace only from the token, and a token without it skips quota and meters to a NULL workspace",
    );
  }
  if (!req.tenantId) {
    throw new S2SError("tenantId is required: Atlas rejects a call with no tenant in token or body");
  }
  if (req.mode === "obo" && !req.subjectToken) {
    throw new S2SError("obo mode requires the member's access token as the exchange subject");
  }

  const key = cacheKey(req);
  const hit = cache.get(key);
  if (hit && hit.expiresAt - EXPIRY_SKEW_SECONDS > nowSeconds()) return hit;

  const body = new URLSearchParams({
    grant_type: TOKEN_EXCHANGE_GRANT,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    audience: req.audience,
    scope: scopeFor(req.audience),
    requested_token_type: ACCESS_TOKEN_TYPE,
    // Read by both platforms as the authorization subject (Runos ADR-010:
    // grants are held by a PRODUCT, and this is where the product code comes
    // from). The caller cannot forge it - the IdP stamps it from the client.
    act_sub: cfg.productCode,
    tenant_id: req.tenantId,
    workspace_id: req.workspaceId,
    mode: req.mode,
  });
  if (req.mode === "obo") {
    body.set("subject_token", req.subjectToken!);
    body.set("subject_token_type", ACCESS_TOKEN_TYPE);
  }

  let res: Response;
  try {
    res = await doFetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (e) {
    throw new S2SError(`token endpoint unreachable: ${cfg.tokenUrl}`, e);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new S2SError(`token exchange failed (${res.status}) for aud=${req.audience}: ${detail.slice(0, 200)}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new S2SError("token exchange returned no access_token");

  const token: S2SToken = {
    accessToken: json.access_token,
    expiresAt: nowSeconds() + (json.expires_in ?? 300),
    audience: req.audience,
    mode: req.mode,
  };
  cache.set(key, token);
  return token;
}
