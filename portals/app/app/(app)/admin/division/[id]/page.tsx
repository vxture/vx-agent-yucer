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

// 编辑大区 - the same form, opened on an existing one.
//
// ROUTED BY ID (owner, 2026-09-09: 名册连接改 id，按行业规范), not by code. The
// code is the anchor imports match on and it is unique only WITHIN a frame
// (0045): a tenant with a GUANZHONG under 陕西 and another under 广东 has two
// rows, and a bookmarked /GUANZHONG would open whichever frame was current.
// The id is the row's, unique across everything, and says nothing a reader
// could mistake for a name. The rest of the product routes the same way.

export const dynamic = "force-dynamic";

export default async function EditDivisionPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
  // Within this workspace and its current frame - the list is already both.
  const mine = rows.find((d) => d.id === id);
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
        /* The frame's carves, on edit too (owner, 2026-09-09: 辖区配置 - 应用
           预置 / 应用模版). The form keeps the code - the anchor - and applies
           a preset's name and members on top, by an explicit click. */
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
        options={memberOptions(
          carves,
          ground.ok ? ground.value : [],
          heldBy,
          PLANNING_TEXT.divisionHintPreset,
        )}
      />
    </ViewLayout>
  );
}
