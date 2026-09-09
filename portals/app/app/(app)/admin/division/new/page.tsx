import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../../components/page-crumbs";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { listMarketDivisions, marketScope } from "../../../../domains/account/service";
import { DIVISION_TEMPLATES } from "../../../../domains/shared/market-division";
import { DivisionForm } from "../../../components/division-form";
import { provinceOptions } from "../../../lib/province-options";

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
  const [divisions, scope] = await Promise.all([listMarketDivisions(ctx), marketScope(ctx)]);
  const rows = divisions.ok ? divisions.value : [];
  const frame = scope.ok ? scope.value : { kind: "china" as const, code: null };
  const heldBy = new Map<string, string>();
  for (const d of rows) for (const p of d.provinces) heldBy.set(p, d.name);

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[
          { label: ADMIN_TEXT.title, href: "/admin" },
          { label: DOMAIN_LABEL.division, href: "/admin/division" },
        ]}
        current={PLANNING_TEXT.divisionNew}
      />
      <ViewHeader title={PLANNING_TEXT.divisionNew} description={PLANNING_TEXT.divisionFormWhy} />
      <DivisionForm
        scope={frame}
        isNew
        code=""
        name=""
        provinces={[]}
        options={provinceOptions(heldBy)}
        /* Every division from every shipped carve, labelled with the carve it
           belongs to - both name a 华东 and a reader picking one has to be able
           to tell which. */
        presets={DIVISION_TEMPLATES.flatMap((t) =>
          t.divisions.map((d) => ({
            key: t.key,
            code: d.code,
            name: d.name,
            from: t.key === "five" ? PLANNING_TEXT.templateFive : PLANNING_TEXT.templateSeven,
            provinces: Object.entries(t.provinces)
              .filter(([, c]) => c === d.code)
              .map(([province]) => province),
          })),
        )}
      />
    </ViewLayout>
  );
}
