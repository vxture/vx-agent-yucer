import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getFieldStore, getDeliveryStore } from "../../../domains/shared/registry";
import { contactRecencyPolicy } from "../../../domains/account/field-service";
import { renewalPolicy } from "../../../domains/delivery/service";
import { ReminderConfigPanel } from "../../components/reminder-config-panel";
import { saveContactRecencyPolicy, saveRenewalPolicy } from "../reminder-actions";
import { loadFailureText } from "../../lib/load-failure";

// 提醒阈值 - three thresholds unified onto one admin page (incr/0065-0066),
// found by the same 商机配置 systematic pass that unified /admin/opportunity
// (PR #307) - see docs/70-workplan/00-index.md's 候选一 note.
//
// NOT ON /admin/opportunity. That page's name and all six existing sections
// are 商机-specific; these three thresholds cross account (联系提醒/决策链
// 温度) and delivery (续约窗口) and the home feed, none of which is
// "opportunity". A new page keeps each page's name honest.
//
// ONE PERMISSION, BOTH DIRECTIONS - `admin.reminderthreshold.view`/`.manage`,
// both resolving to the existing `admin.manage` (no new PermCode, see
// authz/actions.ts's own note): these are workspace administration, not a
// sales capability, and were never tier-gated to begin with, so there is no
// paid-tier removal story to justify a page-specific permission the way
// `pipeline.opportunityConfig` was.

export const dynamic = "force-dynamic";

export default async function ReminderConfigPage() {
  const { ADMIN_TEXT, DOMAIN_LABEL, LOAD_ERROR, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.

  if (!can(session.authz, session.entitlement, "admin.reminderthreshold.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };
  const fieldCtx = { ...base, store: getFieldStore() };
  const deliveryCtx = { ...base, store: getDeliveryStore() };

  const canManage = can(session.authz, session.entitlement, "admin.reminderthreshold.manage", "ui").allowed;

  const [recency, renewal] = await Promise.all([
    contactRecencyPolicy(fieldCtx),
    renewalPolicy(deliveryCtx),
  ]);

  if (!recency.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(recency.violations, LOAD_ERROR)}
      />
    );
  }
  if (!renewal.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(renewal.violations, LOAD_ERROR)}
      />
    );
  }

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={DOMAIN_LABEL.reminderThreshold}
      />
      <ViewHeader
        icon="bell"
        title={DOMAIN_LABEL.reminderThreshold}
        description={ADMIN_TEXT.entryHint.reminderThreshold}
      />

      <ReminderConfigPanel
        canManage={canManage}
        contactRecency={{ policy: recency.value, onSave: saveContactRecencyPolicy }}
        renewal={{ policy: renewal.value, onSave: saveRenewalPolicy }}
      />
    </ViewLayout>
  );
}
