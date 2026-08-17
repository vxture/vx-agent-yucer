import { NextResponse } from "next/server";
import { runArdaSync } from "../../../platform/arda/sync";

// POST /api/arda/sync: pull facts from arda into the signal inbox (ADR-011).
//
// Gated by INTERNAL_JOB_TOKEN exactly as /api/usage/flush is, and fail-closed:
// an unset token refuses. Never a user session - there is no member behind a
// scheduled sync, and accepting one would make the job's reach depend on
// whoever last signed in.
//
// The caller names the workspaces. Nothing in this repo enumerates them, and
// the platform timer is the thing that knows which are provisioned; inventing
// an enumeration here would be a bigger commitment than the job itself.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  const got = req.headers.get("x-internal-job-token");
  if (!expected || got !== expected) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let workspaces: { workspaceId: string; tenantId: string }[] = [];
  try {
    const body = (await req.json()) as { workspaces?: unknown };
    if (Array.isArray(body.workspaces)) {
      workspaces = body.workspaces.filter(
        (w): w is { workspaceId: string; tenantId: string } =>
          typeof w === "object" &&
          w !== null &&
          typeof (w as { workspaceId?: unknown }).workspaceId === "string" &&
          typeof (w as { tenantId?: unknown }).tenantId === "string",
      );
    }
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  const ledger = await runArdaSync({
    workspaces,
    requestId: req.headers.get("x-request-id") ?? undefined,
  });

  // Deliberately off is 200 with status "disabled", not an error: a job nobody
  // configured is not a fault, and dressing it as one means the first real
  // failure reads as more of the same. A genuine failure is non-2xx and still
  // carries the full ledger, because "how far did it get" is the first question.
  return NextResponse.json(ledger, { status: ledger.status === "failed" ? 502 : 200 });
}
