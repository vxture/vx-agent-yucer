import { EmptyState, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { redirect } from "next/navigation";
import { resolveAppSession } from "../../../lib/session";
import { getMessages } from "../../../lib/i18n/server";
import { can } from "../../../../authz/decide";
import { listMarketDivisions } from "../../../../domains/account/service";
import { ALL_PROVINCES } from "../../../../domains/shared/provinces";
import { DIVISION_TEMPLATES } from "../../../../domains/shared/market-division";
import { DivisionForm } from "../../../components/division-form";

// 新建大区 - the create half of the module's own list/create split.

export const dynamic = "force-dynamic";

export default async function NewDivisionPage() {
  const { SHELL_TEXT, PLANNING_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "planning.territory.upsert", "ui").allowed) {
    redirect("/territory");
  }

  const divisions = await listMarketDivisions({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: session.stores.account(),
  });
  const rows = divisions.ok ? divisions.value : [];
  const heldBy = new Map<string, string>();
  for (const d of rows) for (const p of d.provinces) heldBy.set(p, d.name);

  return (
    <ViewLayout>
      <ViewHeader title={PLANNING_TEXT.divisionNew} description={PLANNING_TEXT.divisionFormWhy} />
      <DivisionForm
        isNew
        code=""
        name=""
        provinces={[]}
        options={ALL_PROVINCES.map((p) => ({ province: p, heldBy: heldBy.get(p) ?? null }))}
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
