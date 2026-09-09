import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getAuthzStore } from "../../../authz/store";
import { listWorkspaceMembers } from "../../../authz/admin";
import { ScopeTable } from "../../components/scope-table";
import { loadFailureText } from "../../lib/load-failure";
import { Tag } from "../../components/tag";

// 数据范围 - who sees which rows, across everyone at once.
//
// SPLIT OUT OF 成员与角色 on 2026-09-08 (owner: 一个条目一件事). That page
// answered four questions - who is in, what role they hold, what a role means,
// and what they may see - and the last two had no surface of their own, so
// "why can 张三 not see this deal" was answered by reading a column in a table
// about something else.

export const dynamic = "force-dynamic";

export default async function ScopePage() {
  const { ADMIN_PAGE_TEXT, ADMIN_TEXT, DOMAIN_LABEL, LOAD_ERROR, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }
  if (!can(session.authz, session.entitlement, "admin.member.view", "ui").allowed) {
    return (
      <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />
    );
  }

  const members = await listWorkspaceMembers({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAuthzStore(),
  });
  if (!members.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(members.violations, LOAD_ERROR)}
      />
    );
  }

  const rows = members.value.map((m) => ({
    sub: m.sub,
    name: m.displayName ?? m.sub,
    scope: m.scope,
    territories: m.territoryIds.length,
    active: m.status === "active",
  }));

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={DOMAIN_LABEL.scope}
      />
      <ViewHeader
        icon="eye"
        title={ADMIN_PAGE_TEXT.scopeTitle}
        description={ADMIN_PAGE_TEXT.scopeWhy}
        secondary={
          <Tag>{ADMIN_PAGE_TEXT.scopeCount(rows.length)}</Tag>
        }
      />
      <ScopeTable rows={rows} />
    </ViewLayout>
  );
}
