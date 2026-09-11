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
import { OrgUnitForm } from "../../../components/org-unit-form";

// 新建单位 - the create half of the module's list/create split.

export const dynamic = "force-dynamic";

export default async function NewOrgUnitPage() {
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
  // 组织与区域关联设置 (owner, 2026-09-11: 新建页面也要有) - 选择区域 needs the
  // real territory list even before the unit exists; regions[0] preferred
  // over the territory's own name, same as org-panel.tsx's badge and
  // [id]/page.tsx's edit form.
  const territories = territoriesResult.ok ? territoriesResult.value : [];
  const territoryOptions = territories.map((t) => ({ id: t.id, name: t.regions[0] ?? t.name, code: t.territoryCode }));

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[
          { label: ADMIN_TEXT.title, href: "/admin" },
          { label: DOMAIN_LABEL.orgUnit, href: "/admin/org" },
        ]}
        current={ORG_TEXT.newUnit}
      />
      <ViewHeader icon="tree-structure" title={ORG_TEXT.newUnit} description={ORG_TEXT.formWhy} />
      <OrgUnitForm
        isNew
        id={null}
        unitCode=""
        name=""
        parentId={null}
        kindId={null}
        leaderSub={null}
        parents={(units.ok ? units.value : []).map((u) => ({ id: u.id, name: u.name, depth: u.depth }))}
        kinds={(kinds.ok ? kinds.value : []).map((k) => ({ id: k.id, name: k.name }))}
        leaders={(members.ok ? members.value : []).map((m) => ({ sub: m.sub, name: m.displayName ?? m.sub }))}
        children={0}
        members={0}
        territoryOptions={territoryOptions}
        directTerritoryIds={[]}
        liveDirectTerritoryIds={[]}
        scope="none"
        effectiveTerritoryNames={[]}
        inheritedFromName={null}
      />
    </ViewLayout>
  );
}
