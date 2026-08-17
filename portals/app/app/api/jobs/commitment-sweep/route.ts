import { NextResponse } from "next/server";
import { errorResponse } from "../../../platform/envelope";
import { runCommitmentSweep } from "../../../domains/account/commitment-sweep";

// POST /api/jobs/commitment-sweep: turn overdue promises into proposals.
//
// Same shape as /api/usage/flush and /api/arda/sync: INTERNAL_JOB_TOKEN,
// fail-closed, never a user session. The caller names the workspaces, because
// nothing in this repo enumerates them.
//
// It changes no commitment. A promise going past its date produces a proposal a
// human reads; the row stays `open` until somebody says otherwise. See
// commitment-sweep.ts for why marking `missed` here would be wrong twice over.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  const got = req.headers.get("x-internal-job-token");
  if (!expected || got !== expected) {
    return errorResponse(403, "JOB_TOKEN_INVALID", "internal job token missing or wrong");
  }

  let workspaces: { workspaceId: string }[] = [];
  try {
    const body = (await req.json()) as { workspaces?: unknown };
    if (Array.isArray(body.workspaces)) {
      workspaces = body.workspaces.filter(
        (w): w is { workspaceId: string } =>
          typeof w === "object" &&
          w !== null &&
          typeof (w as { workspaceId?: unknown }).workspaceId === "string",
      );
    }
  } catch {
    return errorResponse(400, "JOB_BODY_INVALID", "request body is not valid JSON", { field: "body" });
  }

  const ledger = await runCommitmentSweep({ workspaces });
  return NextResponse.json(ledger, { status: ledger.failed > 0 ? 502 : 200 });
}
