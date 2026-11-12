import { EmptyState } from "@vxture/design-ui";
import {
  loadAttainmentBase,
  loadAttainmentPlan,
  loadAttainmentTeam,
} from "./board";
import { getMessages } from "../lib/i18n/server";
import { executionRow, scopePlanSupport } from "../lib/attainment-progress";
import { compareAttainmentPeriods, type resolveAttainmentQuery } from "../lib/attainment-workspace";
import { AttainmentTargets } from "../components/attainment-targets";

export async function AttainmentTeam({
  selection,
}: {
  selection: ReturnType<typeof resolveAttainmentQuery>;
}) {
  const [data, team, plan, { ATTAINMENT_PLAN_TEXT: T }] = await Promise.all([
    loadAttainmentBase(),
    loadAttainmentTeam(),
    loadAttainmentPlan(Number(selection.period.replace(/^Y/, "").slice(0, 4))),
    getMessages(),
  ]);
  if (!data || !team) return null;
  if (!plan?.ok || !data.policy.ok) return <EmptyState title={T.loadFailed} />;
  const p = plan.value;
  const currency = data.policy.value.defaultCurrency;
  const makeRow = (member: (typeof team.members)[number], period: string) => ({
    ...executionRow({
      name: member.name,
      scope: `owner:${member.sub}`,
      period,
      target:
        p.targets.find(
          (t) =>
            t.scope === `owner:${member.sub}` &&
            t.period === period &&
            t.currency === currency,
        ) ?? null,
      deals: data.deals.ok ? data.deals.value : null,
      defaultCurrency: currency,
    }),
    subtitle: member.unit,
  });
  const rows = team.members.map((m) => makeRow(m, selection.period));
  return (
    <>
      {!team.placed || team.restricted ? (
        <p className="text-body-small text-muted-foreground">
          {!team.placed ? T.teamUnavailable : T.teamRestricted}
        </p>
      ) : null}
      <AttainmentTargets
        row={null}
        periods={[]}
        regions={rows}
        regionPeriods={Object.fromEntries(
          team.members.map((m) => [
            `owner:${m.sub}`,
            selection.period.startsWith("Y")
              ? [
                  ...new Set(
                    p.targets
                      .filter(
                        (t) =>
                          t.scope === `owner:${m.sub}` &&
                          t.period !== selection.period,
                      )
                      .map((t) => t.period),
                  ),
                ]
                  .sort(compareAttainmentPeriods)
                  .map((period) => makeRow(m, period))
              : [],
          ]),
        )}
        plan={scopePlanSupport(p, "workspace")}
        canPlan={false}
        selectionScope={selection.selection}
        groupKind="member"
      />
    </>
  );
}
