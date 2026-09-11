import { Button, EmptyState, Tooltip, TooltipContent, TooltipTrigger, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";
import { getAuthzStore } from "../../../authz/store";
import { listWorkspaceMembers } from "../../../authz/admin";
import { getPlanningStore } from "../../../domains/shared/registry";
import { listOrgMembers, listOrgTemplates, listOrgUnits, listTerritories } from "../../../domains/planning/service";
import { REGION_AWARE_ORG_TEMPLATES, effectiveTerritoryIds, territoriesWorkedBy } from "../../../domains/planning/lib/org";
import { listCarves, listMarketDivisions } from "../../../domains/account/service";
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
  const account = { ...base, store: session.stores.account() };
  const [units, templates, placements, members, territories, carves, divisions] = await Promise.all([
    listOrgUnits(planning),
    listOrgTemplates(planning),
    listOrgMembers(planning),
    listWorkspaceMembers({ ...base, store: getAuthzStore() }),
    // The other side of the joint (0052), behind planning.territory.view; a
    // reader without it sees the column say 无区域 rather than a wrong count.
    listTerritories(planning),
    // 应用模版 面板 (owner, 2026-09-11): 区域设置的预置划分, for the panel's
    // optional division-sync choice - a reader without account.view just
    // sees no such section, same silent-degrade as territories above.
    listCarves(account),
    listMarketDivisions(account),
  ]);
  if (!units.ok) {
    return <EmptyState title={SHELL_TEXT.loadFailed} description={ORG_TEXT.emptyWhy} />;
  }
  const editable = can(session.authz, session.entitlement, "admin.org.upsert", "ui").allowed;
  // The leader's NAME, off the member list - the unit stores a sub.
  const nameOf = new Map((members.ok ? members.value : []).map((m) => [m.sub, m.displayName ?? m.sub]));
  const childCount = new Map<string, number>();
  for (const u of units.value) if (u.parentId) childCount.set(u.parentId, (childCount.get(u.parentId) ?? 0) + 1);
  // 从业务视角需要实时数据 (owner, 2026-09-11: 可以关联失效，但是不能是错的
  // 关联) - a territory whose 大区 was removed by a division-template switch
  // has `regions: []` (territory.ts's own rule: empty covers NOTHING, the
  // same rule routing already lives by). EXCLUDED HERE, not just hidden in
  // the cell: it must not count toward any unit's own aggregate, the 全范围
  // denominator, or surface a stale name - 关联失效 is fine, a wrong
  // association is not. A unit whose only direct link just went invalid
  // falls through to 继承范围, exactly as it should.
  const worked = (territories.ok ? territories.value : []).filter((t) => t.regions.length > 0);
  // 区域 归属 (owner, 2026-09-11: 高层组织和领导角色需要跟"真正没有权限"区分
  // 开) - SUBTREE-aggregated, the same ground resolve-scope.ts's `unit`
  // branch gives a leader stationed here, not just what is directly linked
  // to this one row. A unit whose subtree reaches every territory that
  // exists gets 全范围 instead of a count that would read as "none".
  //
  // THE DENOMINATOR IS LIVE UNITS ONLY, not every territory row: 应用模版
  // upserts by territory CODE (AUTO-<大区代码>), so switching from 七分法 to
  // 五分法 leaves AUTO-CHINA-NORTHEAST etc. behind, still pointing at a unit
  // id that reset just deleted. Counting those against the total would make
  // 全范围 unreachable forever after the first template switch - counting
  // only territories some LIVE unit still works keeps the badge honest.
  const liveUnitIds = new Set(units.value.map((u) => u.id));
  const allTerritoryIds = new Set(territoriesWorkedBy(worked, liveUnitIds));
  const nameOfUnit = new Map(units.value.map((u) => [u.id, u.name]));
  const rows: OrgUnitRow[] = units.value.map((u) => {
    // 继承范围 (owner, 2026-09-11: 下级没有设置区域，应该显示/生效为继承上
    // 级) - a unit whose own subtree works nothing is not thereby
    // unauthorized, it works whatever its nearest ancestor already covers.
    // Same helper resolve-scope.ts's `unit` branch uses for the real data
    // scope, so the badge and the actual grant cannot read differently.
    const { territoryIds: reachIds, inheritedFrom } = effectiveTerritoryIds(units.value, worked, u.id);
    const reach = new Set(reachIds);
    const scope: OrgUnitRow["scope"] =
      reach.size === 0
        ? "none"
        : inheritedFrom !== null
          ? "inherited"
          : allTerritoryIds.size > 0 && reach.size === allTerritoryIds.size
            ? "full"
            : "partial";
    return {
      territories: worked
        .filter((t) => reach.has(t.id))
        .map((t) => ({ code: t.territoryCode, name: t.name, regions: t.regions })),
      scope,
      inheritedFromName: inheritedFrom !== null ? (nameOfUnit.get(inheritedFrom) ?? null) : null,
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
    };
  });
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
                divisionTemplates={(carves.ok ? carves.value : []).map((t) => ({
                  key: t.key, name: t.name, divisions: t.divisions.length,
                }))}
                currentDivisions={divisions.ok ? divisions.value.length : 0}
                regionAwareOrgKeys={Object.keys(REGION_AWARE_ORG_TEMPLATES)}
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
