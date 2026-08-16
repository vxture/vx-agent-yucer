import { EmptyState, PageSection } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { PLANNING_TEXT, SHELL_TEXT } from "../lib/messages";
import { getPlanningStore } from "../../domains/shared/registry";
import { attainment } from "../../domains/planning/service";
import { PlanningTable } from "../components/planning-table";

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
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const period = currentPeriod();
  const result = await attainment(
    {
      workspaceId: session.workspaceId,
      sub: session.user.sub,
      holder: session.authz,
      entitlement: session.entitlement,
      store: getPlanningStore(),
    },
    period,
  );

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  return (
    <PageSection title={`${PLANNING_TEXT.title} - ${period}`} description={PLANNING_TEXT.description}>
      <PlanningTable rows={result.value} />
    </PageSection>
  );
}
