import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../../components/page-crumbs";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { frameMembers, listCarves, listMarketDivisions, marketScope } from "../../../../domains/account/service";
import { DivisionForm } from "../../../components/division-form";
import { memberOptions } from "../../../lib/member-options";
import { frameNoun } from "../../../lib/frame-copy";

// 新建大区 - the create half of the module's own list/create split.

export const dynamic = "force-dynamic";

export default async function NewDivisionPage() {
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
  const [divisions, scope, ground, carveRows] = await Promise.all([
    listMarketDivisions(ctx), marketScope(ctx), frameMembers(ctx), listCarves(ctx),
  ]);
  const carves = carveRows.ok ? carveRows.value : [];
  const rows = divisions.ok ? divisions.value : [];
  const frame = scope.ok ? scope.value : { kind: "china" as const, code: null };
  const noun = frameNoun(frame, PLANNING_TEXT);
  const heldBy = new Map<string, string>();
  for (const d of rows) for (const m of d.members) heldBy.set(m.key, d.name);

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[
          { label: ADMIN_TEXT.title, href: "/admin" },
          { label: DOMAIN_LABEL.division, href: "/admin/division" },
        ]}
        current={PLANNING_TEXT.divisionNew}
      />
      <ViewHeader title={PLANNING_TEXT.divisionNew} description={PLANNING_TEXT.divisionFormWhy(noun)} />
      <DivisionForm
        scope={frame}
        isNew
        code=""
        name=""
        members={[]}
        options={memberOptions(
          carves,
          ground.ok ? ground.value : [],
          heldBy,
          PLANNING_TEXT.divisionHintPreset,
        )}
        /* Every division from every carve OF THIS FRAME (incr/0047), labelled
           with the carve it belongs to - both china carves name a 华东 and a
           reader picking one has to be able to tell which. */
        presets={carves.flatMap((t) =>
          t.divisions.map((d) => ({
            key: t.key,
            code: d.code,
            name: d.name,
            from: t.name,
            members: Object.entries(t.members)
              .filter(([, c]) => c === d.code)
              .map(([member]) => member),
          })),
        )}
      />
    </ViewLayout>
  );
}
