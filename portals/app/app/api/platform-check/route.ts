import { NextResponse } from "next/server";
import { errorResponse } from "../../platform/envelope";
import { statusMode } from "../../lib/status";
import { resolveWorkspace, runC3ReplayProbe, runPlatformCheck } from "./check";
import { getPlatformClientConfig } from "../../entitlement/platform-client";

// GET /api/platform-check - the self-proof surface: consumer-side verification
// of every platform channel yucer consumes, per the integration rules' go-live
// checklist and the reference implementation's /api/platform-check. The probes
// themselves live in check.ts (a route file may export only its handlers);
// their contract is documented there.
//
// /api/status reports config PRESENCE; this reports whether the channels WORK.
// Gated exactly like /api/status (STATUS_PAGE: off / authed / public).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const mode = statusMode(process.env);
  // Same posture as /api/status: an off switch that announced itself would
  // confirm the product is deployed here.
  if (mode === "off") return errorResponse(404, "PLATFORM_CHECK_NOT_FOUND", "not found");
  const workspaceId = await resolveWorkspace();
  if (mode === "authed" && !workspaceId) {
    return errorResponse(401, "PLATFORM_CHECK_NOT_AUTHENTICATED", "sign in to run the platform check");
  }
  return NextResponse.json(await runPlatformCheck(workspaceId));
}

/**
 * The C3 replay probe (checklist #5): the same idempotency key sent twice; the
 * second answer must say replayed:true and carry the FIRST event's id. This is
 * the ONE probe that spends - at most one yucer.copilot.turns per workspace per
 * day (the key is date-stable), and only on an explicit click, never on load.
 */
export async function POST(req: Request): Promise<Response> {
  const mode = statusMode(process.env);
  if (mode === "off") return errorResponse(404, "PLATFORM_CHECK_NOT_FOUND", "not found");
  const body = (await req.json().catch(() => ({}))) as { probe?: unknown };
  if (body.probe !== "c3-replay") {
    return errorResponse(400, "PLATFORM_CHECK_UNKNOWN_PROBE", "the only spending probe is c3-replay", { field: "probe" });
  }
  const cfg = getPlatformClientConfig();
  if (!cfg) return errorResponse(503, "PLATFORM_CHECK_NOT_CONFIGURED", "PLATFORM_API_URL + PLATFORM_INTERNAL_AUTH_TOKEN are not set");
  const workspaceId = await resolveWorkspace();
  if (!workspaceId) return errorResponse(401, "PLATFORM_CHECK_NOT_AUTHENTICATED", "sign in - the probe consumes against your workspace");

  try {
    return NextResponse.json(await runC3ReplayProbe(workspaceId));
  } catch (err) {
    return errorResponse(502, "PLATFORM_CHECK_CONSUME_UNREACHABLE", err instanceof Error ? err.message : "consume unreachable", { retryable: true });
  }
}
