import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { probeHttp } from "../../lib/status-probe";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthUser } from "../../auth/lib/session";
import { assertInternalTarget } from "../../lib/internal-target";
import { getPlatformClientConfig, parseEntitlementEnvelope } from "../../entitlement/platform-client";
import { getUsageStore } from "../../usage/lib/store";
import { verifySignature, webhookSecrets } from "../../provisioning/lib/verify";
import { getProvisioningStore } from "../../provisioning/lib/store";
import { getS2SConfig } from "../../platform/s2s";
import { AtlasClient, getAtlasConfig } from "../../agent/atlas/client";
import { ATLAS_TASK_ID_MAX } from "../../agent/atlas/types";
import { getRunosConfig } from "../../agent/runos/client";
import { getArdaConfig } from "../../platform/arda/source";
import { COPILOT_TURN_METRIC } from "../../usage/lib/copilot-turns";
import { makePlatformConsume } from "../../usage/lib/flush";

// The probes behind GET /api/platform-check, in a module of their own: a
// Next.js route file may export only its handlers and segment config, and the
// page and the offline tests need the probe runner and its types too.
//
// The self-proof surface: consumer-side verification
// of every platform channel yucer consumes, per the integration rules' go-live
// checklist and the reference implementation's /api/platform-check. Every probe
// is READ-ONLY and spends nothing:
//
//   c1        OIDC discovery reachable, issuer matches, JWKS has keys
//   c2        one live entitlement fetch for the signed-in workspace, with the
//             Cache-Control the platform actually sends (the 45s the client honors)
//   c3Up      consume target configured (always-200 contract) + buffered rows
//   c3Down    verifier self-test (sign as the platform signs, verify, tamper must
//             fail) + the most recent recorded deliveries
//   tokenMint S2S exchange configured, and whether a session is here to mint
//             on-behalf-of
//   planes    Atlas / Runos / arda configured + a bare reachability probe; the
//             authenticated probes arrive with each plane's credentials
//   c3Replay  the checklist's idempotency probe (same key twice -> replayed:true,
//             same event_id). yucer has no counter metric defined yet, so it
//             reports that instead of spending against a metric that does not exist.
//
// /api/status reports config PRESENCE; this reports whether the channels WORK.
// Written into a document, "wired" is a snapshot that rots; an endpoint
// re-verifies every time and is what the platform line is handed instead of a
// screenshot. Gated exactly like /api/status (STATUS_PAGE: off / authed / public).
export interface ProbeResult {
  configured: boolean;
  ok: boolean;
  detail: string;
}

export interface PlatformCheck {
  time: string;
  c1: ProbeResult;
  c2: ProbeResult;
  c3Up: ProbeResult;
  c3Down: ProbeResult;
  tokenMint: ProbeResult;
  planes: { atlas: ProbeResult; runos: ProbeResult; arda: ProbeResult };
  c3Replay: ProbeResult;
}

const notConfigured = (what: string): ProbeResult => ({ configured: false, ok: false, detail: `${what} not set` });
const failed = (err: unknown, what: string): ProbeResult => ({
  configured: true,
  ok: false,
  detail: err instanceof Error ? err.message : `${what} probe failed`,
});

async function checkC1(): Promise<ProbeResult> {
  const cfg = getOidcConfig();
  if (!cfg.enabled) return { configured: false, ok: false, detail: "OIDC_RP_ENABLED is off" };
  try {
    const discoRes = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { cache: "no-store" });
    if (!discoRes.ok) return { configured: true, ok: false, detail: `discovery ${discoRes.status}` };
    const disco = (await discoRes.json()) as { issuer?: string };
    const issuerOk = disco.issuer === cfg.issuer;
    const jwksRes = await fetch(cfg.jwksUrl, { cache: "no-store" });
    if (!jwksRes.ok) return { configured: true, ok: false, detail: `jwks ${jwksRes.status}` };
    const jwks = (await jwksRes.json()) as { keys?: unknown[] };
    const keyCount = Array.isArray(jwks.keys) ? jwks.keys.length : 0;
    return {
      configured: true,
      ok: issuerOk && keyCount > 0,
      detail:
        `discovery ok, issuer ${issuerOk ? "matches" : `MISMATCH (${disco.issuer})`}; ` +
        `jwks ${keyCount} key(s); client ${cfg.clientId}, redirect_uri ${cfg.redirectUri}, scopes "${cfg.scopes}"`,
    };
  } catch (err) {
    return failed(err, "C1");
  }
}

/** Direct fetch (not the cached resolver) so the probe also reports the Cache-Control the platform sends. */
async function checkC2(workspaceId: string | null): Promise<ProbeResult> {
  const cfg = getPlatformClientConfig();
  if (!cfg) return notConfigured("PLATFORM_API_URL + PLATFORM_INTERNAL_AUTH_TOKEN");
  if (!workspaceId) return { configured: true, ok: false, detail: "sign in to resolve your workspace's entitlement" };
  try {
    const url = assertInternalTarget(
      `${cfg.baseUrl.replace(/\/$/, "")}/platform/entitlements` +
        `?workspace_id=${encodeURIComponent(workspaceId)}&product=${encodeURIComponent(cfg.product)}`,
    );
    const res = await fetch(url, {
      headers: { "x-vxture-internal-auth": cfg.authToken, accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { configured: true, ok: false, detail: `entitlement endpoint ${res.status}` };
    const cacheControl = res.headers.get("cache-control") ?? "(no cache-control header)";
    const env = parseEntitlementEnvelope(workspaceId, cfg.product, await res.json());
    return {
      configured: true,
      ok: true,
      detail:
        `status=${env.status ?? "null (never subscribed)"}, tier=${env.tier ?? "null"}, bundled=${env.bundled}, ` +
        `${Object.keys(env.limits).length} limit(s), ${env.quota_pools.length} pool(s); Cache-Control: ${cacheControl}`,
    };
  } catch (err) {
    return failed(err, "C2");
  }
}

async function checkC3Up(): Promise<ProbeResult> {
  const cfg = getPlatformClientConfig();
  if (!cfg) return notConfigured("PLATFORM_API_URL + PLATFORM_INTERNAL_AUTH_TOKEN");
  try {
    const pending = (await getUsageStore().unflushed(50)).length;
    return {
      configured: true,
      ok: true,
      detail:
        `consume target configured (always-200 contract, x-request-id attached); ${pending} buffered row(s) awaiting flush; ` +
        `metric ${COPILOT_TURN_METRIC} is recorded at the copilot turn action point (must be registered on the platform)`,
    };
  } catch (err) {
    return failed(err, "C3-up");
  }
}

async function checkC3Down(): Promise<ProbeResult> {
  const secrets = webhookSecrets();
  if (secrets.length === 0) return notConfigured("PROVISION_WEBHOOK_SECRET");
  // Self-test: sign a synthetic payload exactly as the platform does (t=,v1=
  // over "{t}.{rawBody}") and run it through the real verifier - proves parse,
  // tolerance and the timing-safe compare without a live delivery.
  const t = Math.floor(Date.now() / 1000);
  const raw = JSON.stringify({ probe: true });
  const v1 = createHmac("sha256", secrets[0]).update(`${t}.${raw}`).digest("hex");
  const selfTest = verifySignature(raw, `t=${t},v1=${v1}`, secrets);
  const tampered = verifySignature(`${raw} `, `t=${t},v1=${v1}`, secrets); // must fail
  try {
    const recent = await getProvisioningStore().recentDeliveries(5);
    const seen =
      recent.length === 0
        ? "no deliveries recorded yet - ask the platform line for a test-delivery"
        : `last deliveries: ${recent.map((d) => `${d.type} (${d.result}, ${d.receivedAt.toISOString()})`).join(", ")}`;
    return {
      configured: true,
      ok: selfTest && !tampered,
      detail:
        `verifier self-test ${selfTest ? "passed" : "FAILED"}, tamper rejection ${tampered ? "FAILED" : "passed"}; ` +
        `served at /api/webhooks/vxture (X-4 step 3 complete - the legacy /provisioning/webhook path is gone); ${seen}` +
        `${secrets.length > 1 ? "; rotation secret loaded" : ""}`,
    };
  } catch (err) {
    return failed(err, "C3-down");
  }
}

function checkTokenMint(hasSession: boolean): ProbeResult {
  const s2s = getS2SConfig();
  if (!s2s.enabled) return notConfigured("OIDC_CLIENT_SECRET (the S2S exchange uses the C1 client)");
  return {
    configured: true,
    ok: hasSession,
    detail: hasSession
      ? `on-behalf-of minted per call from this session; act.sub=${s2s.productCode}, token endpoint ${s2s.tokenUrl}`
      : "configured, but no signed-in session to mint against",
  };
}

async function checkPlane(name: string, enabled: boolean, baseUrl: string, requiredEnv: string): Promise<ProbeResult> {
  if (!enabled) return notConfigured(requiredEnv);
  const reachable = await probeHttp(baseUrl);
  return {
    configured: true,
    ok: reachable === true,
    detail: `${name} at ${baseUrl}: ${reachable === true ? "reachable" : reachable === false ? "UNREACHABLE" : "not probed"}; the authenticated probe arrives with the plane's credentials`,
  };
}

/**
 * The C3 replay probe (checklist #5): the same idempotency key sent twice; the
 * second answer must say replayed:true and carry the FIRST event's id. This is
 * the ONE probe that spends - at most one yucer.copilot.turns per workspace per
 * day (the key is date-stable) - so it is a function of its own rather than
 * folded into the GET sweep above, and every caller (the raw route, the admin
 * 系统验证 page's server action) goes through the same idempotency key so a
 * click from either surface on the same day hits the same, already-recorded
 * event rather than spending twice.
 */
export async function runC3ReplayProbe(
  workspaceId: string,
): Promise<{
  ok: boolean;
  detail: string;
  first: Record<string, unknown>;
  second: Record<string, unknown>;
}> {
  const cfg = getPlatformClientConfig();
  if (!cfg) throw new Error("PLATFORM_API_URL + PLATFORM_INTERNAL_AUTH_TOKEN are not set");
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const row = {
    workspaceId,
    metric: COPILOT_TURN_METRIC,
    amount: 1,
    idempotencyKey: `probe-replay-${workspaceId}-${day}`,
    flushed: false,
    platformEventId: null,
    createdAt: new Date(),
  };
  const consume = makePlatformConsume(cfg);
  const first = await consume(row);
  const second = await consume(row);
  const ok =
    first.status === 200 &&
    second.status === 200 &&
    second.body?.replayed === true &&
    Boolean(first.body?.event_id) &&
    first.body?.event_id === second.body?.event_id;
  return {
    ok,
    detail: ok
      ? `replay verified: event ${String(second.body?.event_id)} returned twice, second marked replayed`
      : "replay NOT verified - compare the two raw results",
    first: { status: first.status, ...(first.body ?? {}) },
    second: { status: second.status, ...(second.body ?? {}) },
  };
}

/**
 * The Atlas live-call probe (owner, 2026-09-17): "连接并消耗一点 atlas 的
 * token，按逻辑 atlas 会上报" - `checkPlane` above only proves the base URL
 * answers HTTP, never that a real, authenticated chat call actually completes
 * end to end. This makes ONE real `chat` call with the shortest reasonable
 * prompt and a capped `maxTokens`, through the SAME `AtlasClient.chat()` every
 * copilot turn uses - no bespoke wire path to keep honest.
 *
 * SPENDS REAL MONEY, deliberately not folded into the free `planes.atlas`
 * reachability probe above. Atlas is the metering authority for its own model
 * usage (`30-business-rules.md`'s "谁执行谁上报" exception) - yucer records no
 * local counter for this call and never will; the usage this button causes is
 * whatever Atlas itself reports upstream, which is the entire point of running
 * it: proving that reporting path is alive, not just that a socket opens.
 */
export async function runAtlasProbe(
  workspaceId: string,
  tenantId: string,
): Promise<{ ok: boolean; detail: string }> {
  const cfg = getAtlasConfig();
  if (!cfg.enabled) throw new Error("ATLAS_BASE_URL is not set");
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const taskId = `diag-atlas-${workspaceId}-${day}`.slice(0, ATLAS_TASK_ID_MAX);
  const client = new AtlasClient(cfg);
  const res = await client.chat(
    "chat",
    { messages: [{ role: "user", content: "ping" }], maxTokens: 8 },
    { workspaceId, tenantId, taskId, applicationId: "yucer-diagnostics", requestId: taskId },
  );
  return {
    ok: true,
    detail:
      `model ${res.modelCode} answered in ${res.latencyMs}ms, ` +
      `${res.usage.totalTokens} token(s) (prompt ${res.usage.promptTokens} + completion ${res.usage.completionTokens})`,
  };
}

function c3ReplayDescription(): ProbeResult {
  const cfg = getPlatformClientConfig();
  if (!cfg) return notConfigured("PLATFORM_API_URL + PLATFORM_INTERNAL_AUTH_TOKEN");
  return {
    configured: true,
    ok: false,
    detail:
      `not run on GET - POST { "probe": "c3-replay" } sends the same idempotency key twice and expects replayed:true with the first event_id ` +
      `(checklist #5); spends one ${COPILOT_TURN_METRIC} per workspace per day, only on an explicit click`,
  };
}

/** The signed-in workspace, or null - including when there is no request scope at all (tests). */
export async function resolveWorkspace(): Promise<string | null> {
  const cfg = getOidcConfig();
  if (!cfg.enabled) return null;
  try {
    const jar = await cookies();
    const rpsid = jar.get(cfg.cookieName)?.value;
    const user = rpsid ? await getAuthUser(cfg, rpsid) : null;
    return user?.activeWorkspace ?? null;
  } catch {
    return null;
  }
}

export async function runPlatformCheck(workspaceId: string | null): Promise<PlatformCheck> {
  const atlas = getAtlasConfig();
  const runos = getRunosConfig();
  const arda = getArdaConfig();
  const [c1, c2, c3Up, c3Down, atlasP, runosP, ardaP] = await Promise.all([
    checkC1(),
    checkC2(workspaceId),
    checkC3Up(),
    checkC3Down(),
    checkPlane("Atlas", atlas.enabled, atlas.baseUrl, "ATLAS_BASE_URL"),
    checkPlane("Runos", runos.enabled, runos.baseUrl, "RUNOS_BASE_URL"),
    checkPlane("arda", arda.enabled, arda.baseUrl, "ARDA_BASE_URL"),
  ]);
  return {
    time: new Date().toISOString(),
    c1,
    c2,
    c3Up,
    c3Down,
    tokenMint: checkTokenMint(workspaceId != null),
    planes: { atlas: atlasP, runos: runosP, arda: ardaP },
    c3Replay: c3ReplayDescription(),
  };
}

