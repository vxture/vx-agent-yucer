import { Button, EmptyState, Tooltip, TooltipContent, TooltipTrigger, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getAuthzStore } from "../../../authz/store";
import { listWorkspaceMembers } from "../../../authz/admin";
import { getPlanningStore } from "../../../domains/shared/registry";
import { listOrgMembers, listOrgTemplates, listOrgUnits, listTerritories } from "../../../domains/planning/service";
import { OrgPanel, type OrgUnitRow } from "../../components/org-panel";
import { OrgTemplateReset } from "../../components/org-template-reset";
import { NewEntryLink } from "../../components/form-page";
import { Tag } from "../../components/tag";

// 组织结构 - the fourth axis (incr/0051; owner, 2026-09-10: 完全可以自定义；平台
// 预置模版，多套模版作基准；默认中规模全国公司，总部-大区-团队三级).
//
// HEADER: THREE BUTTONS (owner, 2026-09-11: 头部按钮保留三个，层级设置，应用
// 模版，三方接入（禁用）) - 层级设置 is the renamed 单位类型 button (same
// route, /admin/org/kinds; see ORG_KIND_TEXT.title), 应用模版 is unchanged,
// 三方接入 is a new, permanently-disabled placeholder. 新建单位 moved out of
// the header into OrgPanel's own toolbar, primary, beside the table it acts
// on - see OrgPanel for why.
//
// GATED ON admin.member.view to read - the organisation is what the member
// list is organised by - and admin.org.upsert to change.

export const dynamic = "force-dynamic";

export default async function OrgPage() {
  const { ADMIN_TEXT, DOMAIN_LABEL, ORG_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "admin.member.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }
  const base = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement };
  const planning = { ...base, store: getPlanningStore() };
  const [units, templates, placements, members, territories] = await Promise.all([
    listOrgUnits(planning),
    listOrgTemplates(planning),
    listOrgMembers(planning),
    listWorkspaceMembers({ ...base, store: getAuthzStore() }),
    // The other side of the joint (0052), behind planning.territory.view; a
    // reader without it sees the column say 无区域 rather than a wrong count.
    listTerritories(planning),
  ]);
  if (!units.ok) {
    return <EmptyState title={SHELL_TEXT.loadFailed} description={ORG_TEXT.emptyWhy} />;
  }
  const editable = can(session.authz, session.entitlement, "admin.org.upsert", "ui").allowed;
  // The leader's NAME, off the member list - the unit stores a sub.
  const nameOf = new Map((members.ok ? members.value : []).map((m) => [m.sub, m.displayName ?? m.sub]));
  const childCount = new Map<string, number>();
  for (const u of units.value) if (u.parentId) childCount.set(u.parentId, (childCount.get(u.parentId) ?? 0) + 1);
  const worked = territories.ok ? territories.value : [];
  const rows: OrgUnitRow[] = units.value.map((u) => ({
    territories: worked
      .filter((t) => t.unitIds.includes(u.id))
      .map((t) => ({ code: t.territoryCode, name: t.name, regions: t.regions })),
    id: u.id,
    unitCode: u.unitCode,
    name: u.name,
    parentId: u.parentId,
    kindName: u.kind?.name ?? null,
    leaderSub: u.leaderSub,
    leaderName: u.leaderSub ? (nameOf.get(u.leaderSub) ?? u.leaderSub) : null,
    members: u.members,
    depth: u.depth,
    children: childCount.get(u.id) ?? 0,
  }));
  const placed = rows.reduce((n, r) => n + r.members, 0);
  // Who is in each unit, by name - what the 单位详情 drawer answers.
  const unitMembers: Record<string, string[]> = {};
  // A person in two units is listed under both (0053).
  for (const [sub, unitIds] of placements.ok ? placements.value : new Map<string, string[]>()) {
    for (const unitId of unitIds) (unitMembers[unitId] ??= []).push(nameOf.get(sub) ?? sub);
  }

  return (
    <ViewLayout>
      <PageCrumbs trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]} current={DOMAIN_LABEL.orgUnit} />
      <ViewHeader
        icon="tree-structure"
        title={ORG_TEXT.title}
        description={ORG_TEXT.why}
        secondary={<Tag>{ORG_TEXT.count(rows.length, placed)}</Tag>}
        action={
          editable ? (
            <>
              <NewEntryLink href="/admin/org/kinds" label={ORG_TEXT.kindsButton} />
              <OrgTemplateReset
                templates={(templates.ok ? templates.value : []).map((t) => ({
                  key: t.key, name: t.name, description: t.description, isDefault: t.isDefault, units: t.units.length,
                }))}
                currentUnits={rows.length}
                placed={placed}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="secondary" disabled>{ORG_TEXT.thirdParty}</Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{ORG_TEXT.thirdPartyHint}</TooltipContent>
              </Tooltip>
            </>
          ) : null
        }
      />
      <OrgPanel rows={rows} editable={editable} unitMembers={unitMembers} />
    </ViewLayout>
  );
}
