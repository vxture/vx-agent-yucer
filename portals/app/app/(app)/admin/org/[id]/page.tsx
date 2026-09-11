import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { PageCrumbs } from "../../../components/page-crumbs";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { getAuthzStore } from "../../../../authz/store";
import { listWorkspaceMembers } from "../../../../authz/admin";
import { getPlanningStore } from "../../../../domains/shared/registry";
import { listOrgKinds, listOrgUnits, listUnitDivisionLinks } from "../../../../domains/planning/service";
import { listMarketDivisions } from "../../../../domains/account/service";
import { effectiveTerritoryIds, subtreeIds, territoriesWorkedBy } from "../../../../domains/planning/lib/org";
import { OrgUnitForm, type DivisionScope } from "../../../components/org-unit-form";

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
  const account = { ...base, store: session.stores.account() };
  const [units, kinds, members, linksResult, divisionsResult] = await Promise.all([
    listOrgUnits(planning), listOrgKinds(planning), listWorkspaceMembers({ ...base, store: getAuthzStore() }),
    listUnitDivisionLinks(planning), listMarketDivisions(account),
  ]);
  const all = units.ok ? units.value : [];
  const mine = all.find((u) => u.id === id);
  // An id nobody has is not an error page - the list is one click away.
  if (!mine) redirect("/admin/org");
  // Neither itself nor anything under it may be its parent.
  const banned = new Set(subtreeIds(all, mine.id));

  // 关联区域 (incr/0055, owner 2026-09-11: 组织到大区应该直连，不绕销售
  // 区域一跳) - the SAME reach computation (effectiveTerritoryIds, generic
  // over any `{id, unitIds}` shape) the org-structure table and
  // resolve-scope.ts use for TERRITORIES, called here with 大区 links
  // instead - a department's scope preview cannot promise a 大区 it would
  // not actually get.
  const divisionLinks = linksResult.ok ? linksResult.value : [];
  const allDivisions = divisionsResult.ok ? divisionsResult.value : [];
  const directDivisionIds = divisionLinks.filter((d) => d.unitIds.includes(mine.id)).map((d) => d.id);
  const { territoryIds: effectiveIds, inheritedFrom } = effectiveTerritoryIds(all, divisionLinks, mine.id);
  const effectiveSet = new Set(effectiveIds);
  const liveUnitIds = new Set(all.map((u) => u.id));
  const allDivisionIds = new Set(territoriesWorkedBy(divisionLinks, liveUnitIds));
  const scope: DivisionScope =
    effectiveSet.size === 0
      ? "none"
      : inheritedFrom !== null
        ? "inherited"
        : allDivisionIds.size > 0 && effectiveSet.size === allDivisionIds.size
          ? "full"
          : "partial";

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
        divisionOptions={allDivisions.map((d) => ({ id: d.id, name: d.name, code: d.code }))}
        directDivisionIds={directDivisionIds}
        scope={scope}
        effectiveDivisionNames={allDivisions.filter((d) => effectiveSet.has(d.id)).map((d) => d.name)}
      />
    </ViewLayout>
  );
}
