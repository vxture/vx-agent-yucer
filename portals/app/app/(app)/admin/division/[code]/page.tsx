import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../../components/page-crumbs";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { frameMembers, listMarketDivisions, marketScope } from "../../../../domains/account/service";
import { DivisionForm } from "../../../components/division-form";
import { memberOptions } from "../../../lib/member-options";

// 编辑大区 - the same form, opened on an existing one.

export const dynamic = "force-dynamic";

export default async function EditDivisionPage(
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const { ADMIN_TEXT, DOMAIN_LABEL, PLANNING_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "planning.territory.upsert", "ui").allowed) {
    redirect("/admin/division");
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  };
  const [divisions, scope, ground] = await Promise.all([
    listMarketDivisions(ctx), marketScope(ctx), frameMembers(ctx),
  ]);
  const rows = divisions.ok ? divisions.value : [];
  const frame = scope.ok ? scope.value : { kind: "china" as const, code: null };
  const noun = PLANNING_TEXT.memberNoun[frame.kind] ?? frame.kind;
  const mine = rows.find((d) => d.code === decodeURIComponent(code));
  // A code nobody has is not an error page - the list is one click away and
  // the division may simply have been removed since the link was drawn.
  if (!mine) redirect("/admin/division");

  const heldBy = new Map<string, string>();
  for (const d of rows) for (const m of d.members) heldBy.set(m.key, d.name);

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[
          { label: ADMIN_TEXT.title, href: "/admin" },
          { label: DOMAIN_LABEL.division, href: "/admin/division" },
        ]}
        current={mine.name}
      />
      <ViewHeader title={mine.name} description={PLANNING_TEXT.divisionFormWhy(noun)} />
      <DivisionForm
        scope={frame}
        isNew={false}
        code={mine.code}
        name={mine.name}
        members={mine.members.map((m) => m.key)}
        // Empty when editing: referencing a preset would silently overwrite
        // what this workspace has already decided.
        presets={[]}
        options={memberOptions(
          frame,
          ground.ok ? ground.value : [],
          heldBy,
          (key) => PLANNING_TEXT.templateName[key] ?? key,
          PLANNING_TEXT.divisionHintPreset,
        )}
      />
    </ViewLayout>
  );
}
