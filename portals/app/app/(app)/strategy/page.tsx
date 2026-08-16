import { EmptyState, PageSection } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { SHELL_TEXT, STRATEGY_TEXT } from "../lib/messages";
import { getStrategyStore } from "../../domains/shared/registry";
import { listPlans } from "../../domains/strategy/service";
import { can } from "../../authz/decide";
import { StrategyTable } from "../components/strategy-table";
import { movePlan } from "./actions";

// D1 strategy: the top of the chain. Everything downstream can trace back here,
// which is what makes "how much of this quarter came from the segment we chose
// to attack" a join rather than a manual tally.

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const result = await listPlans({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getStrategyStore(),
  });

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  // The service picks its gate from the DESTINATION - strategy.plan.approve for
  // approving, strategy.plan.update otherwise - so the control is offered when
  // either is held and the refusal, if any, comes from the service.
  //
  // Both action ids currently resolve to the same permission (strategy.write),
  // so this is one check in practice. Making approval a genuine separation of
  // duties would move catalog.ts, the seed SQL and the role doc together, which
  // is a product decision rather than something to slip in here.
  const canMove =
    can(session.authz, session.entitlement, "strategy.plan.update", "ui").allowed ||
    can(session.authz, session.entitlement, "strategy.plan.approve", "ui").allowed;

  return (
    <PageSection title={STRATEGY_TEXT.title} description={STRATEGY_TEXT.description}>
      <StrategyTable rows={result.value} canMove={canMove} onMove={movePlan} />
    </PageSection>
  );
}
