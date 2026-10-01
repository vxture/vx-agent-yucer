import { createHmac, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { probeHttp } from "../../lib/status-probe";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthUser } from "../../auth/lib/session";
import { assertInternalTarget } from "../../lib/internal-target";
import { getPlatformClientConfig, parseEntitlementEnvelope } from "../../entitlement/platform-client";
import { getUsageStore } from "../../usage/lib/store";
import { verifySignature, webhookSecrets } from "../../provisioning/lib/verify";
import { getProvisioningStore } from "../../provisioning/lib/store";
import { getS2SConfig, mintS2SToken } from "../../platform/s2s";
import { AtlasClient, getAtlasConfig, type AtlasContext } from "../../agent/atlas/client";
import { endpointFor } from "../../agent/atlas/endpoints";
import { profileSettings, type CallProfile } from "../../agent/atlas/profiles";
import { parseRouteCatalog } from "../../agent/atlas/routes";
import { ATLAS_CONTRACT_FINGERPRINT, contractDrift } from "../../agent/atlas/contract";
import { MIN_ATLAS_VERSION, MIN_ATLAS_VERSION_REASON, checkAtlasVersion } from "../../agent/atlas/version";
import { ATLAS_TASK_ID_MAX } from "../../agent/atlas/types";
import { RunosClient, getRunosConfig } from "../../agent/runos/client";
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
    // dialogue carries thinking "off": a probe with a tiny maxTokens on a
    // reasoning default spends it all on reasoning and fails with
    // 422 OUTPUT_BUDGET_EXHAUSTED - a false alarm about a healthy plane.
    "dialogue",
    { messages: [{ role: "user", content: "ping" }], maxTokens: 8 },
    // applicationId is a UUID on Atlas's side (its grant lookup casts it): a
    // label like "yucer-diagnostics" failed the probe with a Prisma cast
    // error (2026-09-28). The business paths send a session or run id.
    { workspaceId, tenantId, taskId, applicationId: randomUUID(), requestId: taskId },
  );
  const rerank = await rerankProbe(client, { workspaceId, tenantId, taskId, applicationId: randomUUID(), requestId: `${taskId}-rerank` });
  return {
    ok: true,
    // One fact per line: this is read by a person on the diagnostics page,
    // which renders line breaks (whitespace-pre-line), not by a parser.
    detail: [
      `Chat probe: model ${res.modelCode} answered in ${res.latencyMs}ms, ${res.usage.totalTokens} token(s) (prompt ${res.usage.promptTokens} + completion ${res.usage.completionTokens})`,
      // The subsets Atlas reports since v0.7.13 - each part of its total, and an
      // absent one means "not reported", which is printed as such, never as 0.
      `  of which: cached ${usagePart(res.usage.cachedInputTokens)}, cache-written ${usagePart(res.usage.cacheWriteInputTokens)}, reasoning ${usagePart(res.usage.reasoningTokens)}`,
      "",
      ...rerank,
    ].join("\n"),
  };
}

/** A usage subset for display: the number, or "not reported" - never 0. */
function usagePart(n: number | undefined): string {
  return n === undefined ? "not reported" : String(n);
}

/**
 * What rerank looks like from here (2026-09-30). Its response shape and route
 * name are not published anywhere this repo can read, so before a typed
 * rerank is written this reports the facts it needs, raw: the tool
 * descriptor's input_schema, the route codes yucer holds, and one two-item
 * call's answer. Never fails the probe it rides on - it is a report.
 */
async function rerankProbe(client: AtlasClient, ctx: AtlasContext): Promise<string[]> {
  const clip = (v: unknown, n = 400) => JSON.stringify(v ?? null).slice(0, n);
  const out: string[] = ["Rerank probe:"];
  let routeCodes: string[] = [];
  try {
    routeCodes = [...parseRouteCatalog(await client.modelRoutes(ctx)).routes.keys()].sort((a, b) => a.localeCompare(b));
    out.push(`  routes held: ${routeCodes.join(", ") || "(none)"}`);
  } catch (err) {
    out.push(`  routes held: read failed - ${describe(err)}`);
  }
  try {
    const tools = (await client.tools(ctx)) as { tools?: unknown[] } | unknown[];
    const list = (Array.isArray(tools) ? tools : (tools.tools ?? [])) as Array<Record<string, unknown>>;
    const tool = list.find((t) => /rerank/i.test(String(t.name ?? t.id ?? "")));
    const schema = (tool?.input_schema ?? tool?.inputSchema) as { required?: unknown; properties?: Record<string, unknown> } | undefined;
    if (!schema) {
      out.push("  tool descriptor: rerank is not in the list");
    } else {
      // Only what a caller has to get right: the required fields, and the
      // shape of the two fields that carry the data. The full schema runs to
      // pages of selector prose.
      out.push(
        `  required: ${clip(schema.required)}`,
        `  candidates: ${clip(schema.properties?.candidates)}`,
        `  other fields: ${Object.keys(schema.properties ?? {}).filter((k) => k !== "candidates").join(", ")}`,
      );
    }
  } catch (err) {
    out.push(`  tool descriptor: read failed - ${describe(err)}`);
  }
  const endpointCode = process.env.ATLAS_ENDPOINT_RERANK?.trim() || routeCodes.find((c) => c === "rerank/default") || routeCodes.find((c) => /rerank/i.test(c));
  if (!endpointCode) {
    out.push("  call: skipped - no held route has rerank in its name (set ATLAS_ENDPOINT_RERANK to name one)");
  } else {
    try {
      const answer = await client.rerankRaw(
        {
          endpointCode,
          workspaceId: ctx.workspaceId,
          query: "budget confirmed",
          // Each candidate is { id, text } (RERANK_CANDIDATES_INVALID, seen live
          // 2026-09-30); a bare string is refused.
          candidates: [
            { id: "a", text: "The customer confirmed the budget for next quarter." },
            { id: "b", text: "Lunch was at noon." },
          ],
        },
        ctx,
      );
      out.push(`  call ${endpointCode}: ok`, `  raw answer: ${clip(answer, 800)}`);
    } catch (err) {
      out.push(`  call ${endpointCode}: failed - ${describe(err)}`);
    }
  }
  return out;
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

/**
 * Who a signed-in check speaks for (2026-09-28). With it, the check stops
 * DESCRIBING the S2S path and exercises it: a real on-behalf-of exchange for
 * each plane, then one authenticated read on each - Atlas's model list and
 * Runos's capability discovery. Both reads are free: neither is metered.
 */
export interface LiveIdentity {
  readonly workspaceId: string;
  readonly tenantId: string;
  readonly subjectToken: string;
}

/** A session's live identity, or null when it cannot mint: no access token
 *  (a dev session) or no active tenant (Atlas rejects a token without one). */
export function liveIdentityFrom(s: { workspaceId: string; tenantId: string | null; accessToken: string | null }): LiveIdentity | null {
  if (!s.accessToken || !s.tenantId) return null;
  return { workspaceId: s.workspaceId, tenantId: s.tenantId, subjectToken: s.accessToken };
}

const describe = (err: unknown): string => {
  const e = err as { status?: number; code?: string; message?: string };
  return [e.status ? `HTTP ${e.status}` : "", e.code ?? "", e.message ?? String(err)].filter(Boolean).join(" · ").slice(0, 300);
};

async function liveTokenMint(id: LiveIdentity): Promise<ProbeResult> {
  const out: string[] = [];
  let ok = true;
  for (const audience of ["atlas", "runos"] as const) {
    try {
      const tok = await mintS2SToken({ audience, mode: "obo", workspaceId: id.workspaceId, tenantId: id.tenantId, subjectToken: id.subjectToken });
      out.push(`${audience}: minted, expires in ${Math.max(0, tok.expiresAt - Math.floor(Date.now() / 1000))}s`);
    } catch (err) {
      ok = false;
      out.push(`${audience}: ${describe(err)}`);
    }
  }
  return { configured: true, ok, detail: `on-behalf-of exchange, act.sub=${getS2SConfig().productCode} - ${out.join("; ")}` };
}

async function liveAtlas(id: LiveIdentity): Promise<ProbeResult> {
  const cfg = getAtlasConfig();
  if (!cfg.enabled) return notConfigured("ATLAS_BASE_URL");
  const client = new AtlasClient(cfg);
  const ctx = (tag: string) => ({ ...id, taskId: `diag-${tag}-${Date.now()}`, applicationId: randomUUID(), requestId: `diag-${tag}-${Date.now()}` });
  let models: string;
  try {
    const list = (await client.models(ctx("models"))) as { data?: unknown[]; models?: unknown[] } | unknown[];
    const n = Array.isArray(list) ? list.length : (list.data ?? list.models ?? []).length;
    models = `authenticated GET /v1/models answered 200 - ${n} model(s) visible to yucer`;
  } catch (err) {
    return { configured: true, ok: false, detail: `Atlas at ${cfg.baseUrl}: authenticated GET /v1/models failed - ${describe(err)}` };
  }
  // The two reads batch 2 added (2026-09-30): the routes each call profile
  // uses, with what they can take, and whether the contract moved under us.
  const [routes, contract, version] = await Promise.all([
    routesLine(client, ctx("routes")),
    contractLine(client, ctx("contract")),
    versionLine(client),
  ]);
  return {
    configured: true,
    ok: routes.ok && contract.ok && version.ok,
    detail: [`Atlas ${cfg.baseUrl}`, `  ${models}`, `  ${version.text}`, ...routes.lines.map((l) => `  ${l}`), `  ${contract.text}`].join("\n"),
  };
}

/** The profiles that serve members today; triage has no caller yet. */
const PROFILES_IN_USE: readonly CallProfile[] = ["dialogue", "judgement", "drafting"];

async function routesLine(client: AtlasClient, ctx: AtlasContext): Promise<{ ok: boolean; lines: string[] }> {
  try {
    const catalog = parseRouteCatalog(await client.modelRoutes(ctx));
    let ok = true;
    const parts = PROFILES_IN_USE.map((p) => {
      const code = endpointFor(profileSettings(p).task);
      const r = catalog.routes.get(code);
      if (!r || r.state !== "active") {
        ok = false;
        return `${p} -> ${code}: ${r ? r.state : "not granted"}`;
      }
      const modes = r.thinkingModes ? r.thinkingModes.join("/") : "?";
      return `${p} -> ${code}: window ${r.contextWindow ?? "?"}, output ${r.maxOutputTokens ?? "?"}, thinking ${modes}`;
    });
    return { ok, lines: parts };
  } catch (err) {
    return { ok: false, lines: [`GET /v1/model-routes failed - ${describe(err)}`] };
  }
}

/**
 * The Atlas version, against the floor. Only a version KNOWN to be old fails:
 * an unreadable one is reported and left alone, since the check exists to catch
 * the behaviour change the contract fingerprint cannot see (version.ts).
 */
async function versionLine(client: AtlasClient): Promise<{ ok: boolean; text: string }> {
  try {
    const check = checkAtlasVersion((await client.healthz()).version);
    if (check.kind === "ok") return { ok: true, text: `version ${check.version} (floor ${MIN_ATLAS_VERSION})` };
    if (check.kind === "unknown") return { ok: true, text: "version: not readable from /healthz" };
    return { ok: false, text: `version ${check.version} is BELOW the floor ${MIN_ATLAS_VERSION} - ${MIN_ATLAS_VERSION_REASON}` };
  } catch (err) {
    return { ok: true, text: `version: /healthz not readable - ${describe(err)}` };
  }
}

async function contractLine(client: AtlasClient, ctx: AtlasContext): Promise<{ ok: boolean; text: string }> {
  try {
    const drift = contractDrift(await client.contract(ctx));
    if (drift.kind === "same") return { ok: true, text: `contract ${ATLAS_CONTRACT_FINGERPRINT} (as pinned)` };
    if (drift.kind === "unreadable") return { ok: false, text: "contract answered without a fingerprint" };
    return {
      ok: false,
      text: `contract MOVED: pinned ${ATLAS_CONTRACT_FINGERPRINT}, live ${drift.live} - review requests/errorCodes, then move the pin (agent/atlas/contract.ts)`,
    };
  } catch (err) {
    return { ok: false, text: `GET /.well-known/vxture-contract failed - ${describe(err)}` };
  }
}

async function liveRunos(id: LiveIdentity): Promise<ProbeResult> {
  const cfg = getRunosConfig();
  if (!cfg.enabled) return notConfigured("RUNOS_BASE_URL");
  try {
    // The shape the copilot turn sends (orchestrator/turn.ts): a non-empty
    // query and a limit - an empty query breaks Runos's input contract.
    const caps = await new RunosClient(cfg).discover({ query: "sales", limit: 20 }, { ...id, taskId: `diag-runos-${Date.now()}` });
    return {
      configured: true,
      ok: true,
      detail: `Runos at ${cfg.baseUrl}: authenticated runos_discover answered - ${caps.length} capabilit${caps.length === 1 ? "y" : "ies"} granted to yucer${caps.length === 0 ? " (an empty catalog is a normal answer)" : ""}`,
    };
  } catch (err) {
    return { configured: true, ok: false, detail: `Runos at ${cfg.baseUrl}: authenticated runos_discover failed - ${describe(err)}` };
  }
}

export async function runPlatformCheck(workspaceId: string | null, live: LiveIdentity | null = null): Promise<PlatformCheck> {
  const atlas = getAtlasConfig();
  const runos = getRunosConfig();
  const arda = getArdaConfig();
  const [c1, c2, c3Up, c3Down, atlasP, runosP, ardaP] = await Promise.all([
    checkC1(),
    checkC2(workspaceId),
    checkC3Up(),
    checkC3Down(),
    live ? liveAtlas(live) : checkPlane("Atlas", atlas.enabled, atlas.baseUrl, "ATLAS_BASE_URL"),
    live ? liveRunos(live) : checkPlane("Runos", runos.enabled, runos.baseUrl, "RUNOS_BASE_URL"),
    checkPlane("arda", arda.enabled, arda.baseUrl, "ARDA_BASE_URL"),
  ]);
  return {
    time: new Date().toISOString(),
    c1,
    c2,
    c3Up,
    c3Down,
    tokenMint: live && getS2SConfig().enabled ? await liveTokenMint(live) : checkTokenMint(workspaceId != null),
    planes: { atlas: atlasP, runos: runosP, arda: ardaP },
    c3Replay: c3ReplayDescription(),
  };
}

