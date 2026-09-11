import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { PageCrumbs } from "../../../components/page-crumbs";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { getAuthzStore } from "../../../../authz/store";
import { listWorkspaceMembers } from "../../../../authz/admin";
import { getPlanningStore } from "../../../../domains/shared/registry";
import { listOrgKinds, listOrgUnits } from "../../../../domains/planning/service";
import { listMarketDivisions } from "../../../../domains/account/service";
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
  const account = { ...base, store: session.stores.account() };
  const [units, kinds, members, divisionsResult] = await Promise.all([
    listOrgUnits(planning), listOrgKinds(planning), listWorkspaceMembers({ ...base, store: getAuthzStore() }), listMarketDivisions(account),
  ]);
  // 关联区域 (incr/0055, owner 2026-09-11: 组织到大区应该直连) - 选择区域
  // needs the real 大区 list even before the unit exists.
  const divisionOptions = (divisionsResult.ok ? divisionsResult.value : []).map((d) => ({ id: d.id, name: d.name, code: d.code }));

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
        divisionOptions={divisionOptions}
        directDivisionIds={[]}
        scope="none"
        effectiveDivisionNames={[]}
      />
    </ViewLayout>
  );
}
