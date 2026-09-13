import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { listStageDefinitions, stageDefinitionUsage } from "../../../domains/pipeline/service";
import { StageDefinitionConfig } from "../../components/stage-definition-config";
import {
  moveStageDefinitionAction,
  removeStageDefinitionAction,
  saveStageDefinition,
} from "../../pipeline/stage-definition-actions";
import { loadFailureText } from "../../lib/load-failure";

// 商机阶段 - 业务参数, one item in 配置管理 (incr/0057-0059).
//
// TEMPORARY ROUTE: this page's content moves into /admin/opportunity's 商机
// 阶段 section in the last PR of this batch, the same way 赢丢原因/预测阈值/
// 计价规则/账龄分档 each had (or, for this one, would otherwise have had) their
// own standalone route first. Kept as its own route here rather than deferred
// entirely so the backend this batch's first PR shipped has a real surface to
// verify against before the assembly PR lands.

export const dynamic = "force-dynamic";

export default async function StageDefinitionPage() {
  const { ADMIN_TEXT, LOAD_ERROR, SHELL_TEXT, STAGE_CONFIG_TEXT } = await getMessages();
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
  if (!can(session.authz, session.entitlement, "pipeline.stage.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }
  /* view 只决定这页可不可见, 新建/改名/排序/删除要 pipeline.stage.manage - 同一
     形状 pipeline.winloss.view/record 已经在用。 */
  const editable = can(session.authz, session.entitlement, "pipeline.stage.manage", "ui").allowed;

  const [stages, usage] = await Promise.all([
    listStageDefinitions(ctx),
    stageDefinitionUsage(ctx),
  ]);
  if (!stages.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(stages.violations, LOAD_ERROR)}
      />
    );
  }

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={STAGE_CONFIG_TEXT.title}
      />
      <StageDefinitionConfig
        stages={stages.value}
        usage={usage.ok ? usage.value : {}}
        editable={editable}
        onSave={saveStageDefinition}
        onMove={moveStageDefinitionAction}
        onDelete={removeStageDefinitionAction}
      />
    </ViewLayout>
  );
}
