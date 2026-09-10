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
import { subtreeIds } from "../../../../domains/planning/lib/org";
import { OrgUnitForm } from "../../../components/org-unit-form";

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
  const [units, kinds, members] = await Promise.all([
    listOrgUnits(planning), listOrgKinds(planning), listWorkspaceMembers({ ...base, store: getAuthzStore() }),
  ]);
  const all = units.ok ? units.value : [];
  const mine = all.find((u) => u.id === id);
  // An id nobody has is not an error page - the list is one click away.
  if (!mine) redirect("/admin/org");
  // Neither itself nor anything under it may be its parent.
  const banned = new Set(subtreeIds(all, mine.id));

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[
          { label: ADMIN_TEXT.title, href: "/admin" },
          { label: DOMAIN_LABEL.orgUnit, href: "/admin/org" },
        ]}
        current={mine.name}
      />
      <ViewHeader title={mine.name} description={ORG_TEXT.formWhy} />
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
      />
    </ViewLayout>
  );
}
