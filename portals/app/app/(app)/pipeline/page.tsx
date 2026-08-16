import { EmptyState, PageStack } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { SHELL_TEXT } from "../lib/messages";
import { PipelineBoard, type PipelineRow } from "../components/pipeline-board";
import { getPipelineStore } from "../../domains/shared/registry";
import { listPendingReviews, listPipeline } from "../../domains/pipeline/service";
import { can } from "../../authz/decide";
import { PendingReviews } from "../components/pending-reviews";
import { recordReview } from "./winloss-action";

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

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPipelineStore(),
  };

  const [result, pendingReviews] = await Promise.all([listPipeline(ctx), listPendingReviews(ctx)]);

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

  return (
    <PageStack>
      {/* The gate, not the raw permission. Reading permissions.has() directly
          skips the ENTITLEMENT half entirely, so a workspace whose subscription
          lapsed would still render the board as writable - and the two gates
          are ordered precisely so the tier answer comes first. */}
      <PipelineBoard
        rows={rows}
        readOnly={
          !can(session.authz, session.entitlement, "pipeline.opportunity.advance", "ui").allowed
        }
      />
      {/* Only rendered when the workspace bought win/loss. The list is the debt
          the "must review on close" rule creates; without it the rule is a
          sentence in a document. */}
      {pendingReviews.ok ? (
        <PendingReviews
          opportunities={pendingReviews.value}
          canRecord={can(session.authz, session.entitlement, "pipeline.winloss.record", "ui").allowed}
          onRecord={recordReview}
        />
      ) : null}
    </PageStack>
  );
}
