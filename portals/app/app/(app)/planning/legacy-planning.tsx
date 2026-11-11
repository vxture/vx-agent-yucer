import {
  EmptyState,
  Section,
  StatusBadge,
  ViewLayout,
} from "@vxture/design-ui";
import { ModuleHeadline } from "../components/module-headline";
import { resolveAppSession } from "../lib/session";
import { formatMoney, formatPercent } from "../lib/view-model";
import { getPlanningStore } from "../../domains/shared/registry";
import {
  attainment,
  listTerritories,
  listOrgUnits,
  listUnitDivisionLinks,
} from "../../domains/planning/service";
import { listMarketDivisions } from "../../domains/account/service";
import { salesRegionCode, salesRegionTerritories } from "../lib/sales-regions";
import { PlanningTable } from "../components/planning-table";
import { TerritoryPanel } from "../components/territory-panel";
import { NewEntryLink } from "../components/form-page";
import { deleteSalesTarget, updateSalesTarget } from "./actions";
import { can } from "../../authz/decide";

import { getMessages } from "../lib/i18n/server";
import { summaryTarget } from "../../domains/planning/lib/target";
import { currentPeriod } from "../../domains/shared/period";
import { loadFailureText } from "../lib/load-failure";
import { lockedPage } from "../components/locked-page";

// Geographic regions come from configuration. Organization units only assign
// responsibility; their count and names never define the regional target scopes.

export const dynamic = "force-dynamic";

export default async function LegacyPlanningPage() {
  const { PLANNING_TEXT, DOMAIN_LABEL, SHELL_TEXT, LOAD_ERROR } =
    await getMessages();
  const session = await resolveAppSession();
  if (!session) return null;
  // Not bought: the upgrade template in place of the page (owner 2026-09-28).
  const locked = lockedPage(session, "planning");
  if (locked) return locked;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.

  const period = currentPeriod(new Date());
  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getPlanningStore(),
  };
  const result = await attainment(ctx, period);

  const [territories, divisions, orgUnits, unitLinks] = await Promise.all([
    listTerritories(ctx, { includeRetired: true }),
    listMarketDivisions({ ...ctx, store: session.stores.account() }),
    listOrgUnits(ctx),
    listUnitDivisionLinks(ctx),
  ]);
  const geographicTerritories =
    territories.ok && divisions.ok
      ? salesRegionTerritories(divisions.value, territories.value)
      : [];
  const byCode = new Map(
    geographicTerritories.map((t) => [t.territoryCode, t]),
  );
  const unitName = new Map(
    (orgUnits.ok ? orgUnits.value : []).map((u) => [u.id, u.name]),
  );
  const territoryNames = new Map([
    ...(territories.ok
      ? territories.value.map((t) => [t.id, t.name] as const)
      : []),
    ...geographicTerritories.map((t) => [t.id, t.name] as const),
  ]);

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
  // THE SENTENCE MOVED when the headline stopped being the period (it "belongs
  // beside the targets it describes") and for a while it was computed and
  // never shown. It heads the targets section now. Three states, each its own
  // sentence: measured (money / money · pct), not measurable (the gap's own
  // reason, never 0%), no workspace target at all.
  const summary = summaryTarget(result.value.map((r) => r.target));
  const workspaceRow = summary
    ? result.value.find((r) => r.target.id === summary.id)
    : undefined;
  const leadLine = (() => {
    if (!workspaceRow || workspaceRow.target.targetValue.unit !== "money") {
      return PLANNING_TEXT.leadNoWorkspaceTarget;
    }
    const value = workspaceRow.target.targetValue;
    const m = workspaceRow.measurement;
    if (m.kind !== "measured" || m.achieved.unit !== "money") {
      return PLANNING_TEXT.leadNotMeasured(
        formatMoney(value.amount, value.currency),
        m.kind === "not_measurable"
          ? (PLANNING_TEXT.gapLabel[m.code] ?? m.code)
          : "",
      );
    }
    return PLANNING_TEXT.leadAttained(
      formatMoney(m.achieved.amount, m.achieved.currency),
      formatMoney(value.amount, value.currency),
      formatPercent(m.ratio),
    );
  })();
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
        tags={
          <>
            <StatusBadge tone="info">
              {PLANNING_TEXT.tagPeriod(period)}
            </StatusBadge>
            <StatusBadge tone="success">
              {PLANNING_TEXT.tagScopes(result.value.length)}
            </StatusBadge>
            {unforecast > 0 ? (
              <StatusBadge tone="warning">
                {PLANNING_TEXT.tagUnforecast(unforecast)}
              </StatusBadge>
            ) : null}
          </>
        }
      />

      {divisions.ok && territories.ok ? (
        <TerritoryPanel
          canConfigure={
            can(
              session.authz,
              session.entitlement,
              "planning.division.view",
              "ui",
            ).allowed
          }
          rows={divisions.value.map((d) => ({
            id: d.id,
            code: d.code,
            name: d.name,
            members: d.members,
            ownerSub: byCode.get(salesRegionCode(d.code))?.ownerSub ?? null,
            units: (unitLinks.ok
              ? (unitLinks.value.find((link) => link.id === d.id)?.unitIds ??
                [])
              : []
            )
              .map((id) => unitName.get(id))
              .filter((x): x is string => Boolean(x)),
          }))}
          action={
            can(
              session.authz,
              session.entitlement,
              "planning.division.upsert",
              "ui",
            ).allowed ? (
              <NewEntryLink
                href="/admin/division"
                label={PLANNING_TEXT.territoryNewEntry}
              />
            ) : null
          }
        />
      ) : (
        <EmptyState
          title={SHELL_TEXT.loadFailed}
          description={loadFailureText(
            !divisions.ok
              ? divisions.violations
              : !territories.ok
                ? territories.violations
                : [],
            LOAD_ERROR,
          )}
        />
      )}

      <Section
        icon="target"
        title={PLANNING_TEXT.targetRoster}
        description={leadLine}
        action={
          can(
            session.authz,
            session.entitlement,
            "planning.target.create",
            "ui",
          ).allowed ? (
            <NewEntryLink
              href="/planning/new"
              label={PLANNING_TEXT.targetNew}
            />
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
          onDelete={deleteSalesTarget}
        />
      </Section>
    </ViewLayout>
  );
}
