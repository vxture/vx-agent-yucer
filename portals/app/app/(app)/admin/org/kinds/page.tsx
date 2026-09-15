import { ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { PageCrumbs } from "../../../components/page-crumbs";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { getPlanningStore } from "../../../../domains/shared/registry";
import { listOrgKinds, listOrgUnits } from "../../../../domains/planning/service";
import { OrgKindsConfig } from "../../../components/org-kinds-config";

// 单位类型 - the vocabulary a unit is typed by (incr/0051). Reached from the
// roster's header and the form's 配置; not a sidebar item.

export const dynamic = "force-dynamic";

export default async function OrgKindsPage() {
  const { ADMIN_TEXT, DOMAIN_LABEL, ORG_KIND_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.
  if (!can(session.authz, session.entitlement, "admin.org.upsert", "ui").allowed) {
    redirect("/admin/org");
  }
  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPlanningStore(),
  };
  const [kinds, units] = await Promise.all([listOrgKinds(ctx), listOrgUnits(ctx)]);
  const count = new Map<string, number>();
  for (const u of units.ok ? units.value : []) count.set(u.kindId, (count.get(u.kindId) ?? 0) + 1);
  const rows = (kinds.ok ? kinds.value : []).map((k) => ({ id: k.id, code: k.kindCode, name: k.name, units: count.get(k.id) ?? 0 }));

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[
          { label: ADMIN_TEXT.title, href: "/admin" },
          { label: DOMAIN_LABEL.orgUnit, href: "/admin/org" },
        ]}
        current={ORG_KIND_TEXT.title}
      />
      <OrgKindsConfig rows={rows} />
    </ViewLayout>
  );
}
