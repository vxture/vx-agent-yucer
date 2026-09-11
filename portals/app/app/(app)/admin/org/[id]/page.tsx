import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { PageCrumbs } from "../../../components/page-crumbs";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { getAuthzStore } from "../../../../authz/store";
import { listWorkspaceMembers } from "../../../../authz/admin";
import { getPlanningStore } from "../../../../domains/shared/registry";
import { listOrgKinds, listOrgUnits, listTerritories } from "../../../../domains/planning/service";
import { effectiveTerritoryIds, subtreeIds, territoriesWorkedBy } from "../../../../domains/planning/lib/org";
import { OrgUnitForm, type TerritoryScope } from "../../../components/org-unit-form";

// 配置单位 - the same form, opened on an existing one. ROUTED BY ID: the code
// is the anchor, the id is the row's.

export const dynamic = "force-dynamic";

export default async function EditOrgUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ADMIN_TEXT, DOMAIN_LABEL, ORG_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "admin.org.upsert", "ui").allowed) {
    redirect("/admin/org");
  }
  const base = { workspaceId: session.workspaceId, sub: session.user.sub, holder: session.authz, entitlement: session.entitlement };
  const planning = { ...base, store: getPlanningStore() };
  const [units, kinds, members, territoriesResult] = await Promise.all([
    listOrgUnits(planning), listOrgKinds(planning), listWorkspaceMembers({ ...base, store: getAuthzStore() }), listTerritories(planning),
  ]);
  const all = units.ok ? units.value : [];
  const mine = all.find((u) => u.id === id);
  // An id nobody has is not an error page - the list is one click away.
  if (!mine) redirect("/admin/org");
  // Neither itself nor anything under it may be its parent.
  const banned = new Set(subtreeIds(all, mine.id));

  // 关联区域 (owner, 2026-09-11: 不要补齐所有显示信息，尤其需要设计关联区域 -
  // 向下聚合，向上继承，选择区域，暂不关联) - the SAME reach computation the
  // org-structure table and resolve-scope.ts's real data-scope use, scoped
  // to this one unit, so the form's preview cannot promise a scope the
  // member would not actually get.
  const territories = territoriesResult.ok ? territoriesResult.value : [];
  // 从业务视角需要实时数据 (owner, 2026-09-11: 可以关联失效，但是不能是错的
  // 关联) - a territory whose 大区 no longer exists has `regions: []` and
  // covers NOTHING (territory.ts's own rule); excluded from the SCOPE
  // preview so it cannot present a dead link as live coverage. `territories`
  // (unfiltered) still backs the picker and the direct-link chips below -
  // an admin's actual direct choice stays visible even while invalid.
  const scopeTerritories = territories.filter((t) => t.regions.length > 0);
  const directTerritoryIds = territories.filter((t) => t.unitIds.includes(mine.id)).map((t) => t.id);
  // The CHIPS shown collapsed are live-only too, same rule: a direct link
  // whose division was removed must not read as a chip naming ground that
  // is not there. `directTerritoryIds` (unfiltered) still seeds the
  // drawer's pre-tick, so the admin opening 选择区域 sees the true stored
  // state and can actually clear the dead link, not just stop seeing it.
  const liveDirectTerritoryIds = directTerritoryIds.filter((tid) => scopeTerritories.some((t) => t.id === tid));
  const { territoryIds: effectiveIds, inheritedFrom } = effectiveTerritoryIds(all, scopeTerritories, mine.id);
  const effectiveSet = new Set(effectiveIds);
  const liveUnitIds = new Set(all.map((u) => u.id));
  const allTerritoryIds = new Set(territoriesWorkedBy(scopeTerritories, liveUnitIds));
  const scope: TerritoryScope =
    effectiveSet.size === 0
      ? "none"
      : inheritedFrom !== null
        ? "inherited"
        : allTerritoryIds.size > 0 && effectiveSet.size === allTerritoryIds.size
          ? "full"
          : "partial";
  // 第一个关联区域名称=区域设置的名称 (owner, 2026-09-11) - `regions[0]`, the
  // 大区's CURRENT name, live every read; `name` is the territory's own,
  // set once and never renamed. Same preference as org-panel.tsx's badge.
  const label = (t: { readonly name: string; readonly regions: readonly string[] }) => t.regions[0] ?? t.name;

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[
          { label: ADMIN_TEXT.title, href: "/admin" },
          { label: DOMAIN_LABEL.orgUnit, href: "/admin/org" },
        ]}
        current={mine.name}
      />
      <ViewHeader icon="tree-structure" title={mine.name} description={ORG_TEXT.formWhy} />
      <OrgUnitForm
        isNew={false}
        id={mine.id}
        unitCode={mine.unitCode}
        name={mine.name}
        parentId={mine.parentId}
        kindId={mine.kindId}
        leaderSub={mine.leaderSub}
        parents={all.filter((u) => !banned.has(u.id)).map((u) => ({ id: u.id, name: u.name, depth: u.depth }))}
        kinds={(kinds.ok ? kinds.value : []).map((k) => ({ id: k.id, name: k.name }))}
        leaders={(members.ok ? members.value : []).map((m) => ({ sub: m.sub, name: m.displayName ?? m.sub }))}
        children={all.filter((u) => u.parentId === mine.id).length}
        members={mine.members}
        territoryOptions={territories.map((t) => ({ id: t.id, name: label(t), code: t.territoryCode }))}
        directTerritoryIds={directTerritoryIds}
        liveDirectTerritoryIds={liveDirectTerritoryIds}
        scope={scope}
      />
    </ViewLayout>
  );
}
