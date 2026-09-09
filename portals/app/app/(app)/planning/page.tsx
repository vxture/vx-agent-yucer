import { EmptyState, Section, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { ModuleHeadline } from "../components/module-headline";
import { resolveAppSession } from "../lib/session";
import { formatMoney, formatPercent } from "../lib/view-model";
import { getPlanningStore } from "../../domains/shared/registry";
import { attainment, listTerritories } from "../../domains/planning/service";
import { PlanningTable } from "../components/planning-table";
import { TerritoryPanel } from "../components/territory-panel";
import { NewEntryLink } from "../components/form-page";
import { updateSalesTarget } from "./actions";
import { can } from "../../authz/decide";

import { getMessages } from "../lib/i18n/server";
import { summaryTarget } from "../../domains/planning/lib/target";
import { currentPeriod } from "../../domains/shared/period";
import { loadFailureText } from "../lib/load-failure";
// D2 planning: 规划团队 -> 划定区域 -> 明确指标 (owner, 2026-09-08).
//
// ONE FLOW, ONE PAGE. 销售区域 was a module of its own from 2026-08-30, which
// put the three steps of one act behind two menu entries: you drew the ground
// on one page and set the number it carries on another, and the page that
// needed a territory to exist could only tell you so in a sentence. The roster
// is here now, above the targets, in the order the work happens - and a reader
// who finds the scope selector empty is looking at the reason.
//
// WHAT DID NOT COME WITH IT: 大区. That is how the market is CARVED, not who
// works it - configuration, read by every figure the situation screen groups,
// changed rarely - so it sits behind the gear at /admin/division. Two
// dimensions, two places; they were one page and kept being read as one thing.
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
  // RETIRED ONES INCLUDED: the roster below has to show a wound-down region -
  // it still holds its code, and un-retiring it is done from that row. The
  // scope selector that must NOT offer one lives on /planning/new and narrows
  // the list itself; the filtered copy stayed here after the form moved out,
  // computed for nobody.
  const territories = await listTerritories(ctx, { includeRetired: true });
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
    (r) =>
      r.measurement.kind === "not_measurable" &&
      r.measurement.code === "no_snapshot",
  ).length;

  return (
    <ViewLayout>
      {/* THE MODULE HEADER (design_yucer_100). The title was the PERIOD, which
          reads as a filter rather than a name, and the attainment sentence it
          carried belongs beside the targets it describes.

          NO FOLD: the targets below ARE the breakdown - one row per scope with
          its own measurement - so a strip above them would be the same
          partition, coarser.

          UNFORECAST IS A BADGE AND NOT A ZERO, which is this page's central
          rule: a scope nobody has forecast has not failed, and a reader who
          sees a neutral number with no explanation will read it as one. */}
      <ModuleHeadline
        moduleKey="planning"
        description={PLANNING_TEXT.leadRule}
        tags={
          <>
            <StatusBadge tone="info">{PLANNING_TEXT.tagPeriod(period)}</StatusBadge>
            <StatusBadge tone="success">{PLANNING_TEXT.tagScopes(result.value.length)}</StatusBadge>
            {unforecast > 0 ? (
              <StatusBadge tone="warning">
                {PLANNING_TEXT.tagUnforecast(unforecast)}
              </StatusBadge>
            ) : null}
          </>
        }
      />

      {/* 划定区域, FIRST - a territory is a precondition for a regional
          target, and this page used to say that in a sentence while the
          roster lived elsewhere. RETIRED ONES INCLUDED: a wound-down region
          still holds its code, and un-retiring it is done from its row. */}
      {/* THE ACTION SITS IN THE PANEL'S OWN HEADER (DS Section `action`), not
          in a row under it - this page owns two tables, and a create button
          floating between them belongs to neither. NAMED for the same reason:
          two bare 新建 on one page would make the reader guess which. */}
      <TerritoryPanel
        rows={territories.ok ? territories.value : []}
        action={
          can(session.authz, session.entitlement, "planning.territory.upsert", "ui")
            .allowed ? (
            <NewEntryLink
              href="/planning/territory/new"
              label={PLANNING_TEXT.territoryNewEntry}
            />
          ) : null
        }
      />

      <Section
        icon="target"
        title={PLANNING_TEXT.title}
        description={PLANNING_TEXT.description}
        action={
          can(session.authz, session.entitlement, "planning.target.create", "ui")
            .allowed ? (
            <NewEntryLink href="/planning/new" label={PLANNING_TEXT.targetNew} />
          ) : null
        }
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
