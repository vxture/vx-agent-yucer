import { EmptyState, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { ModuleHeadline } from "../components/module-headline";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { getPipelineStore } from "../../domains/shared/registry";
import {
  listPendingReviews,
  listPipeline,
  listWinLossReasons,
} from "../../domains/pipeline/service";
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
  const { LOAD_ERROR, SHELL_TEXT, WINLOSS_TEXT } = await getMessages();
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
    store: session.stores.pipeline(),
  };

  const [pending, all, reasons] = await Promise.all([
    listPendingReviews(ctx),
    listPipeline(ctx),
    // 赢丢原因, the workspace's own (0039). A refused read leaves the picker
    // empty rather than the page broken: the roster above still answers its
    // own question.
    listWinLossReasons(ctx),
  ]);

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
      {/* NO FOLD: won versus lost is TWO buckets, not a partition worth a
          bar - and the reviews below say which each one was. */}
      <ModuleHeadline
        moduleKey="winLossReview"
        description={WINLOSS_TEXT.description}
        tags={
          <StatusBadge tone={pending.value.length > 0 ? "warning" : "success"}>
            {WINLOSS_TEXT.tagPending(pending.value.length)}
          </StatusBadge>
        }
      />
      <PendingReviews
        opportunities={pending.value}
        allClosed={closed}
        reasons={(reasons.ok ? reasons.value : []).map((r) => ({
          id: r.id, name: r.name, forWon: r.forWon, forLost: r.forLost,
        }))}
        canRecord={
          can(
            session.authz,
            session.entitlement,
            "pipeline.winloss.record",
            "ui",
          ).allowed
        }
        onRecord={recordReview}
      />
    </ViewLayout>
  );
}
