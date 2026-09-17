"use server";

import { resolveAppSession, tenantIdOf } from "../../lib/session";
import { can } from "../../../authz/decide";
import { runAtlasProbe, runC3ReplayProbe, runPlatformCheck, type PlatformCheck } from "../../../api/platform-check/check";

// 系统验证 > 平台对接's own writes (owner, 2026-09-17).
//
// TWO ACTIONS, TWO GATES. Re-probing is a read (admin.diagnostics.view, the
// same gate the page itself already passed to render at all) - refreshDiagnosticsAction
// exists only because the page is a server component and a client "re-probe"
// click needs a server round-trip to call. Running the replay probe is the
// ONE thing here that spends a real yucer.copilot.turns unit against the
// workspace's quota, so it is gated separately (admin.diagnostics.probe): a
// member who can see this page is not automatically a member who may spend
// against it - same split as catalog.write / catalog.price.

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export async function refreshDiagnosticsAction(): Promise<Result<{ check: PlatformCheck }>> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  if (!can(session.authz, session.entitlement, "admin.diagnostics.view", "ui").allowed) {
    return { ok: false, error: "permission_denied" };
  }
  return { ok: true, check: await runPlatformCheck(session.workspaceId) };
}

/**
 * probeOk is deliberately not `ok` - {ok:true} & {ok: boolean} would collapse
 * to a literal `true` and silently discard whatever the probe actually
 * reported, hiding a real replay-mismatch behind an envelope that always
 * reads as if the request itself succeeded.
 */
export async function runDiagnosticsProbeAction(): Promise<
  Result<{ probeOk: boolean; detail: string }>
> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  if (!can(session.authz, session.entitlement, "admin.diagnostics.probe", "data").allowed) {
    return { ok: false, error: "permission_denied" };
  }
  try {
    const result = await runC3ReplayProbe(session.workspaceId);
    return { ok: true, probeOk: result.ok, detail: result.detail };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "probe_failed" };
  }
}

/**
 * The Atlas live-call probe: same gate as the C3 replay probe above, for the
 * same reason - it spends real money against the workspace's model usage the
 * moment it runs. tenantId is required by AtlasContext itself (mintS2SToken
 * refuses to mint without one); a workspace with no active tenant cannot run
 * this probe at all, which is a true statement about that workspace, not a
 * bug in the probe.
 */
export async function runAtlasProbeAction(): Promise<
  Result<{ probeOk: boolean; detail: string }>
> {
  const session = await resolveAppSession();
  if (!session) return { ok: false, error: "not_authenticated" };
  if (!can(session.authz, session.entitlement, "admin.diagnostics.probe", "data").allowed) {
    return { ok: false, error: "permission_denied" };
  }
  const tenantId = tenantIdOf(session);
  if (!tenantId) return { ok: false, error: "no_active_tenant" };
  try {
    const result = await runAtlasProbe(session.workspaceId, tenantId);
    return { ok: true, probeOk: result.ok, detail: result.detail };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "probe_failed" };
  }
}
