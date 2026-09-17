import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getAuthzStore } from "../../../authz/store";
import { listWorkspaceMembers } from "../../../authz/admin";
import { getAuditStore } from "../../../audit/lib/store";
import { AuditRoster } from "../../components/audit-roster";
import { Tag } from "../../components/tag";

// 安全审计 (owner, 2026-09-17): "记录对配置的操作。不涉及业务操作...系统被
// 改了，要知道谁改的，什么时间，改了什么". A real, browsable, filtered log -
// replaces the old placeholder 操作审计 entry (href: null) in admin-nav.ts.
//
// EXACTLY SEVEN ACTIONS, all member/role administration writes - confirmed
// against the real recordAuditEvent() call sites in authz/admin.ts and
// authz/roles.ts, not guessed: admin.member.role.assign/.revoke,
// admin.member.deactivate/.reactivate/.scope, admin.role.upsert/.remove.
// copilot.ask rides the same append-only local_audit.event table for an
// unrelated reason (X-3 cost tracing) and is deliberately excluded - this is
// a SECURITY log, not a business-data one.
//
// NO TIME WINDOW NARROWS THE QUERY (unlike 赋能分析's rolling 30 days) - a
// security log's whole point is to be browsable, including old rows; the
// table's own pagination is what keeps a long list usable, not a cutoff that
// would quietly hide a change from six months ago that somebody now needs to
// find.
//
// GATED ON admin.audit.view (admin.manage, no feature key - same reasoning as
// every other admin.* read: workspace administration is not a sales
// capability a tier can withhold).

export const dynamic = "force-dynamic";

const CONFIG_ACTIONS = [
  "admin.member.role.assign",
  "admin.member.role.revoke",
  "admin.member.deactivate",
  "admin.member.reactivate",
  "admin.member.scope",
  "admin.role.upsert",
  "admin.role.remove",
] as const;

const AUDIT_LIST_LIMIT = 500;

export default async function AuditPage() {
  const { ADMIN_TEXT, AUDIT_TEXT, DOMAIN_LABEL } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.
  if (!can(session.authz, session.entitlement, "admin.audit.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }

  const base = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const [events, members] = await Promise.all([
    getAuditStore().listSince(session.workspaceId, new Date(0), {
      actions: CONFIG_ACTIONS,
      limit: AUDIT_LIST_LIMIT,
    }),
    listWorkspaceMembers({ ...base, store: getAuthzStore() }),
  ]);
  const nameOf = new Map(
    (members.ok ? members.value : []).map((m) => [m.sub, m.displayName ?? m.sub]),
  );

  const rows = events.map((e) => ({
    id: e.id,
    occurredAt: e.occurredAt,
    actorSub: e.actorId,
    actorName: nameOf.get(e.actorId) ?? e.actorId,
    action: e.action,
    objectType: e.objectType,
    objectId: e.objectId,
    outcome: e.outcome,
  }));

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={DOMAIN_LABEL.audit}
      />
      <ViewHeader
        icon="clipboard"
        title={AUDIT_TEXT.title}
        description={AUDIT_TEXT.description}
        secondary={<Tag>{AUDIT_TEXT.count(rows.length)}</Tag>}
      />
      <AuditRoster rows={rows} />
    </ViewLayout>
  );
}
