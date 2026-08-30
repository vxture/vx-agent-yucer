import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getPipelineStore } from "../../domains/shared/registry";
import { listPendingReviews, listPipeline } from "../../domains/pipeline/service";
import { PendingReviews } from "../components/pending-reviews";
import { recordReview } from "../pipeline/winloss-action";
import { loadFailureText } from "../lib/load-failure";

// D6 win/loss reviews - a module page since 2026-08-30.
//
// BOTH LISTS COME FROM READS THAT CANNOT DISAGREE. The pending set is the
// service's own answer; "every closed deal", which the panel offers as its
// wider scope, is filtered out of the SAME pipeline read rather than queried
// separately - two reads of the same rows can differ, and both would be on
// screen at once.

export const dynamic = "force-dynamic";

export default async function WinLossPage() {
  const { SHELL_TEXT, LOAD_ERROR } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPipelineStore(),
  };

  const [pending, all] = await Promise.all([listPendingReviews(ctx), listPipeline(ctx)]);

  if (!pending.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(pending.violations, LOAD_ERROR)}
      />
    );
  }

  const closed = (all.ok ? all.value : []).filter(
    (o) => o.status === "won" || o.status === "lost",
  );

  return (
    <ViewLayout>
      <PendingReviews
        opportunities={pending.value}
        allClosed={closed}
        canRecord={
          can(session.authz, session.entitlement, "pipeline.winloss.record", "ui").allowed
        }
        onRecord={recordReview}
      />
    </ViewLayout>
  );
}
