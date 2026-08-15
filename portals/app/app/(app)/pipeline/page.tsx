import { EmptyState } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { SHELL_TEXT } from "../lib/messages";
import { PipelineBoard, type PipelineRow } from "../components/pipeline-board";
import { getPipelineStore } from "../../domains/shared/registry";
import { listPipeline } from "../../domains/pipeline/service";

// D6 pipeline page.
//
// Dynamic, never cached: the rows are workspace-scoped and gate-filtered, and a
// cached render is a render of somebody else's answer.

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const result = await listPipeline({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPipelineStore(),
  });

  if (!result.ok) {
    // The gate's own message, not a generic error: "you need the pro tier" and
    // "something broke" are different things to tell someone.
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  const rows: PipelineRow[] = result.value.map((o) => ({
    ...o,
    accountName: o.accountName ?? o.accountId,
  }));

  return <PipelineBoard rows={rows} readOnly={!session.authz.permissions.has("pipeline.write")} />;
}
