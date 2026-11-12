import { EmptyState, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { lockedPage } from "../components/locked-page";
import { getMessages } from "../lib/i18n/server";
import { can } from "../../authz/decide";
import { readSalesPlan } from "../../domains/planning/plan-service";
import { PlanError } from "../../domains/planning/plan-model";
import { planVersions } from "../../domains/planning/plan-state";
import { getPlanningStore } from "../../domains/shared/registry";
import {
  checkPlanRead,
  freshPlan,
  loadPlanSources,
  salesPlanContext,
} from "./plan-data";
import { PlanningVersionPanel } from "./version-panel";
import LegacyPlanningPage from "./legacy-planning";
export const dynamic = "force-dynamic";
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string | string[];
    region?: string | string[];
    revision?: string | string[];
    period?: string | string[];
  }>;
}) {
  const session = await resolveAppSession();
  if (!session) return null;
  const locked = lockedPage(session, "planning");
  if (locked) return locked;
  const { year: suppliedYear, region, revision, period } = await searchParams;
  const {
    PLAN_VERSION_ERROR: E,
    SHELL_TEXT,
    ATTAINMENT_PLAN_TEXT: AT,
  } = await getMessages();
  if (
    Array.isArray(suppliedYear) ||
    Array.isArray(region) ||
    Array.isArray(revision) ||
    Array.isArray(period)
  )
    return <EmptyState title={AT.contextMissing} />;
  if (session.scope.kind !== "workspace")
    return region || revision ? (
      <EmptyState title={AT.contextMissing} />
    ) : (
      <LegacyPlanningPage />
    );
  const year =
    suppliedYear &&
    /^\d{4}$/.test(suppliedYear) &&
    Number(suppliedYear) >= 2000 &&
    Number(suppliedYear) <= 2200
      ? Number(suppliedYear)
      : new Date().getUTCFullYear();
  try {
    const [plan, sources, legacy] = await Promise.all([
      readSalesPlan(salesPlanContext(session), year),
      loadPlanSources(session),
      getPlanningStore().listTargets(session.workspaceId),
    ]);
    for (const r of plan?.revisions ?? []) checkPlanRead(session, r.content);
    const selected = revision
      ? plan?.revisions.find((r) => r.id === revision && r.state === "sealed")
      : null;
    if (revision && !selected) return <EmptyState title={AT.contextMissing} />;
    const previewContent = freshPlan(year, sources);
    const displayed =
      selected?.content ??
      (plan
        ? planVersions(plan, new Date().toISOString()).current?.content
        : null) ??
      previewContent;
    if (
      (region && !displayed.regions.some((r) => r.id === region)) ||
      (period && !displayed.periods.some((p) => p.key === period))
    )
      return <EmptyState title={AT.contextMissing} />;
    const legacyIds = legacy
      .filter(
        (t) =>
          !t.id.startsWith("plan_") &&
          t.status !== "closed" &&
          t.scopeType !== "owner" &&
          (t.period === `${year}` ||
            t.period === `Y${year}` ||
            new RegExp(`^${year}Q[1-4]$`).test(t.period)) &&
          (t.scopeType === "workspace" ||
            sources.regions.some((r) => r.id === t.territoryId)),
      )
      .map((t) => t.id);
    return (
      <ViewLayout>
        <PlanningVersionPanel
          key={`${year}|${revision ?? "current"}|${region ?? "company"}|${period ?? ""}`}
          initialRevision={revision}
          initialRegion={region}
          initialPeriod={period}
          initialPlan={plan}
          initialNow={new Date().toISOString()}
          previewContent={previewContent}
          year={year}
          sources={sources}
          legacyIds={legacyIds}
          canEdit={
            can(
              session.authz,
              session.entitlement,
              "planning.target.update",
              "ui",
            ).allowed
          }
        />
      </ViewLayout>
    );
  } catch (error) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={
          E[error instanceof PlanError ? error.code : "source_read_failed"] ??
          E.plan_save_failed
        }
      />
    );
  }
}
