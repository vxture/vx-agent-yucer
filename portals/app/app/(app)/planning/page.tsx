import { Card, EmptyState, Section, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { formatMoney, formatPercent } from "../lib/view-model";
import { getPlanningStore } from "../../domains/shared/registry";
import { attainment, listTerritories } from "../../domains/planning/service";
import { PlanningTable } from "../components/planning-table";
import { SetTarget } from "../components/set-target";
import { createSalesTarget, updateSalesTarget } from "./actions";
import { can } from "../../authz/decide";

import { getMessages } from "../lib/i18n/server";
// D2 planning: targets against what actually closed.
//
// The column that matters is attainment, and the thing it must never do is
// render "no snapshot yet" as 0%. Those are different facts - one means nobody
// has forecast this scope this period, the other means the period is going
// badly - and collapsing them reports an unforecast quarter as a failed one.

export const dynamic = "force-dynamic";

/** Current period, derived from today. Replaced by a picker when D2 gets one. */
function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
}

export default async function PlanningPage() {
  const { PLANNING_TEXT, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const period = currentPeriod();
  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPlanningStore(),
  };
  const result = await attainment(ctx, period);

  // Territory names, so the scope column reads as a place and not as a code.
  // Through the gated service, so a member who may read targets but not the
  // territory registry simply gets codes back rather than the page refusing -
  // planning.territory.view is a separate permission from the one above.
  const territories = await listTerritories(ctx);
  const territoryNames = new Map(
    territories.ok ? territories.value.map((t) => [t.id, t.name]) : [],
  );

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  // The workspace row is the number this page exists for, so it is stated
  // rather than left to be found in row one of a table. It may legitimately be
  // absent - a period can be planned by territory only - and that is said
  // rather than shown as a zero.
  const workspaceRow = result.value.find(
    (r) => r.target.scopeType === "workspace",
  );
  const unforecast = result.value.filter((r) => !r.hasSnapshot).length;

  return (
    <ViewLayout>
      <Card className="p-lg">
        {/* ONE child, so Card's gap-xl never fires between a title and its own
            captions. */}
        <div className="flex flex-col gap-2xs">
          <h1 className="text-heading-2 text-foreground">
            {PLANNING_TEXT.lead(period)}
          </h1>
          <p className="text-muted-foreground text-body-sm tabular-nums">
            {workspaceRow
              ? PLANNING_TEXT.leadAttained(
                  workspaceRow.closed
                    ? formatMoney(
                        workspaceRow.closed.amount,
                        workspaceRow.closed.currency,
                      )
                    : "-",
                  formatMoney(
                    workspaceRow.target.targetAmount.amount,
                    workspaceRow.target.targetAmount.currency,
                  ),
                  workspaceRow.hasSnapshot
                    ? formatPercent(workspaceRow.ratio)
                    : PLANNING_TEXT.noSnapshot,
                )
              : PLANNING_TEXT.leadNoWorkspaceTarget}
          </p>
          {/* Counted and stated, because the whole point of this page's central
              rule is that an unforecast scope is NOT a failed one. A reader who
              sees three neutral badges and no explanation will read them as
              zeroes. */}
          {unforecast > 0 ? (
            <p className="text-body-sm text-(color:--warning-text)">
              {PLANNING_TEXT.leadUnforecast(unforecast)}
            </p>
          ) : null}
          <p className="text-muted-foreground text-body-sm">
            {PLANNING_TEXT.leadRule}
          </p>
        </div>
      </Card>

      {/* ABOVE the table, because it is what you do when the table is empty -
          and on a fresh workspace it always is. A create form tucked under a
          list nobody can populate is a doorway behind a locked door. */}
      <SetTarget
        period={period}
        canCreate={
          can(
            session.authz,
            session.entitlement,
            "planning.target.create",
            "ui",
          ).allowed
        }
        territories={
          territories.ok
            ? territories.value.map((t) => ({ id: t.id, name: t.name }))
            : []
        }
        onCreate={createSalesTarget}
      />

      <Section
        icon="target"
        title={PLANNING_TEXT.title}
        description={PLANNING_TEXT.description}
      >
        <PlanningTable
          rows={result.value}
          territoryNames={territoryNames}
          /* Decided here, re-decided inside the action. This only chooses
             whether the row menu renders. */
          canUpdate={
            can(
              session.authz,
              session.entitlement,
              "planning.target.update",
              "ui",
            ).allowed
          }
          onUpdate={updateSalesTarget}
        />
      </Section>
    </ViewLayout>
  );
}
