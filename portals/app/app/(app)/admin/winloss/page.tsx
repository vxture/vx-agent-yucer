import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { listWinLossReasons, winLossReasonUsage } from "../../../domains/pipeline/service";
import { WinLossReasonConfig } from "../../components/win-loss-reason-config";
import {
  moveWinLossReasonAction,
  removeWinLossReasonAction,
  saveWinLossReason,
} from "../../pipeline/reason-actions";
import { loadFailureText } from "../../lib/load-failure";

// 赢丢原因 - 业务参数, one item in 配置管理 (incr/0039).
//
// WHY IT LIVES HERE AND NOT ON /winloss. The list is configuration - set once,
// read by every review afterwards - and 赢丢复盘 is where a person works
// through the reviews themselves. Putting the editor on that page would make
// it do both, which is the split the plane exists to keep.
//
// THE CITED COUNT IS COMPUTED HERE, from the reviews the workspace already
// has: the config table shows how many reviews stand behind each reason, and
// that number is what makes the delete refusal predictable rather than a
// surprise at the moment of clicking.

export const dynamic = "force-dynamic";

export default async function WinLossReasonPage() {
  const { ADMIN_TEXT, LOAD_ERROR, SHELL_TEXT, WINLOSS_TEXT } = await getMessages();
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
  if (!can(session.authz, session.entitlement, "pipeline.winloss.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }

  const [reasons, usage] = await Promise.all([
    listWinLossReasons(ctx),
    winLossReasonUsage(ctx),
  ]);
  if (!reasons.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(reasons.violations, LOAD_ERROR)}
      />
    );
  }

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={WINLOSS_TEXT.reasonConfigTitle}
      />
      {/* Same as /admin/industry: the header belongs to the panel, because
          新建原因 opens a dialog only the panel can open - it renders in the
          panel's own FilterBar, not the ViewHeader. */}
      <WinLossReasonConfig
        reasons={reasons.value}
        usage={usage.ok ? usage.value : {}}
        onSave={saveWinLossReason}
        onMove={moveWinLossReasonAction}
        onDelete={removeWinLossReasonAction}
      />
    </ViewLayout>
  );
}
