import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { can } from "../../../authz/decide";
import { resolveAppSession } from "../../lib/session";
import {
  getPlanningStore,
  getStrategyStore,
} from "../../../domains/shared/registry";
import { workspaceCompleteness } from "../../../domains/account/service";
import { getMessages } from "../../lib/i18n/server";
import { loadFailureText } from "../../lib/load-failure";
import { BatchCompleteness } from "../../components/batch-completeness";
import { applyBatchFill } from "./actions";

// D4: the batch version of the one-click fill on /account/[id] - run the
// derivable half of completeness across every customer this member can see,
// not one at a time.
//
// ONLY THE DATA HALF, THE SAME LINE completeness.ts DRAWS ON A SINGLE RECORD.
// A batch that also asked the model per account would spend a turn per
// customer in the workspace on one click - the exact defect the module exists
// to name, at roster scale. The model half stays the per-account "ask the
// assistant" button; nothing here spends Atlas.

export const dynamic = "force-dynamic";

export default async function AccountBatchCompletePage() {
  const { BATCH_COMPLETE_TEXT, SHELL_TEXT, LOAD_ERROR } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const rows = await workspaceCompleteness({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
    pipeline: session.stores.pipeline(),
    planning: getPlanningStore(),
    strategy: getStrategyStore(),
  });

  if (!rows.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(rows.violations, LOAD_ERROR)}
      />
    );
  }

  return (
    <ViewLayout>
      <ViewHeader
        title={BATCH_COMPLETE_TEXT.title}
        description={BATCH_COMPLETE_TEXT.description}
      />
      <BatchCompleteness
        rows={rows.value.map((r) => ({
          key: `${r.accountId}:${r.gap.field}`,
          accountId: r.accountId,
          accountName: r.accountName,
          field: r.gap.field,
          suggestion: r.gap.suggestion as string,
          basis: r.gap.basis,
        }))}
        canApply={
          can(session.authz, session.entitlement, "account.upsert", "ui")
            .allowed
        }
        onApply={applyBatchFill}
      />
    </ViewLayout>
  );
}
