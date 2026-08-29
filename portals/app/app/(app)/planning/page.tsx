import { Card, EmptyState, Section, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { formatMoney, formatPercent } from "../lib/view-model";
import { getPlanningStore } from "../../domains/shared/registry";
import { attainment, listTerritories } from "../../domains/planning/service";
import { PlanningTable } from "../components/planning-table";
import { SetTarget } from "../components/set-target";
import { TerritoryPanel } from "../components/territory-panel";
import { createSalesTarget, saveTerritory, updateSalesTarget } from "./actions";
import { can } from "../../authz/decide";

import { getMessages } from "../lib/i18n/server";
import { summaryTarget } from "../../domains/planning/lib/target";
import { currentPeriod } from "../../domains/shared/period";
import { loadFailureText } from "../lib/load-failure";
// D2 planning: targets against what actually closed.
//
// The column that matters is attainment, and the thing it must never do is
// render "no snapshot yet" as 0%. Those are different facts - one means nobody
// has forecast this scope this period, the other means the period is going
// badly - and collapsing them reports an unforecast quarter as a failed one.

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const { PLANNING_TEXT, SHELL_TEXT, LOAD_ERROR } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const period = currentPeriod(new Date());
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
  // RETIRED ONES INCLUDED, once. The roster has to show a wound-down region -
  // it still holds its code, and un-retiring it is done from that row - while
  // the target scope selector below must not offer one. One read, and the
  // narrowing stated at the site that needs it.
  const territories = await listTerritories(ctx, { includeRetired: true });
  const activeTerritories = territories.ok
    ? territories.value.filter((t) => t.status === "active")
    : [];
  const territoryNames = new Map(
    territories.ok ? territories.value.map((t) => [t.id, t.name]) : [],
  );

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(result.violations, LOAD_ERROR)}
      />
    );
  }

  // The workspace row is the number this page exists for, so it is stated
  // rather than left to be found in row one of a table. It may legitimately be
  // absent - a period can be planned by territory only - and that is said
  // rather than shown as a zero.
  // A MONEY target. The lead line formats money and quotes a percentage of it;
  // a workspace-scope new-logo target picked up here would print a customer
  // count with a yuan sign, which is TD-013 in one sentence. Same rule the
  // board's quota card uses - it was written inline twice and got it wrong
  // both times.
  const summary = summaryTarget(result.value.map((r) => r.target));
  const workspaceRow = summary
    ? result.value.find((r) => r.target.id === summary.id)
    : undefined;
  const unforecast = result.value.filter(
    (r) => r.measurement.kind === "not_measurable" && r.measurement.code === "no_snapshot",
  ).length;

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
                  workspaceRow.measurement.kind === "measured"
                    ? formatMoney(
                        workspaceRow.measurement.achieved.amount,
                        workspaceRow.measurement.achieved.unit === "money"
                          ? workspaceRow.measurement.achieved.currency
                          : "",
                      )
                    : "-",
                  workspaceRow.target.targetValue.unit === "money"
                    ? formatMoney(
                        workspaceRow.target.targetValue.amount,
                        workspaceRow.target.targetValue.currency,
                      )
                    : String(workspaceRow.target.targetValue.amount),
                  workspaceRow.measurement.kind === "measured"
                    ? formatPercent(workspaceRow.measurement.ratio)
                    : PLANNING_TEXT.gapLabel[workspaceRow.measurement.code]!,
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
          activeTerritories.length > 0
            ? activeTerritories.map((t) => ({ id: t.id, name: t.name }))
            : []
        }
        onCreate={createSalesTarget}
      />

      {/* BELOW the target form and above the table. A territory is a
          PRECONDITION for a regional target, so a reader who finds the scope
          selector empty needs the next thing they see to be where regions come
          from - not a list of targets they cannot yet scope. */}
      <TerritoryPanel
        rows={territories.ok ? territories.value : []}
        canEdit={
          can(
            session.authz,
            session.entitlement,
            "planning.territory.upsert",
            "ui",
          ).allowed
        }
        onSave={saveTerritory}
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
