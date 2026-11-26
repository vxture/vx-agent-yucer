import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { getMessages } from "../lib/i18n/server";
import { preferredPlanningYear } from "../../domains/planning/plan-years";
import { listFocusPlanningYears, readFocusWorkspace } from "../../domains/planning/focus-read";
import { PlanError } from "../../domains/planning/plan-values";
import { focusContext } from "./context";
import { focusQuery } from "../lib/focus-workspace";
import { lockedPage } from "../components/locked-page";
import { FocusWorkspaceView } from "./workspace";
import { can } from "../../authz/decide";
export const dynamic = "force-dynamic";
export default async function NamedAccountPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const session = await resolveAppSession();
  if (!session) return null;
  const locked = lockedPage(session, "namedAccount");
  if (locked) return locked;
  const { FOCUS_TEXT: T, PLAN_VERSION_ERROR: E } = await getMessages();
  const params = await searchParams;
  const query = focusQuery(params);
  if (!query) return <EmptyState title={E.invalid_period}/>;
  try {
    const availableYears = await listFocusPlanningYears(focusContext(session));
    if (!params.year) query.year = preferredPlanningYear(availableYears);
    const workspace = await readFocusWorkspace(focusContext(session), query);
    return <ViewLayout><FocusWorkspaceView key={`${query.year}:${workspace.period}:${workspace.regionId}:${workspace.revision?.id}:${workspace.editToken}:${workspace.eventNo}`} workspace={workspace} availableYears={availableYears}
      canOpenPlanning={session.scope.kind === "workspace" && can(session.authz, session.entitlement, "planning.target.view", "ui").allowed}
      canCreateAccount={can(session.authz, session.entitlement, "account.upsert", "ui").allowed}/></ViewLayout>;
  } catch (e) { return <EmptyState title={T.sourceUnavailable} description={E[e instanceof PlanError ? e.code : "source_read_failed"] ?? T.error}/>; }
}
