import { Section } from "../../components/help-section";
import { ViewHeader } from "../../components/business-controls";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  EmptyState,
  Icon,
  StatusBadge,
  ViewLayout,
} from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { resolveNavigation } from "../../lib/navigation";
import {
  hasHome,
  resolveFunctionalDomains,
  type ResolvedModule,
} from "../../lib/functional-domains";
import { factsFor } from "./facts";
import { readDeploymentOverview } from "./deployment-data";
import { DeploymentOverviewPanel, DeploymentYearControl } from "./deployment-overview";
import { salesPlanContext } from "../../planning/plan-data";

// A domain home.
//
// It exists only for a domain holding two or more routes, and the rule lives
// in functional-domains.ts rather than here: a domain with ONE route already
// has a home - that route - and putting a second page in front of it would be
// a door standing before a door.
//
// WHAT IT IS NOT. It is not the module list from the launcher rendered larger.
// That page was argued against when the launcher was built and the argument
// still holds: its whole content would be what the reader was already looking
// at when they clicked. What earns this page is the fact that lives BETWEEN
// its modules - an unpriced product, a cut of the market matching nobody, a
// lead that qualified and stopped - each of which needs two module pages read
// against each other, which is exactly the reading nobody does.
//
// The modules appear underneath, because arriving somewhere you do need the
// way onward. They are the second half of the page, not the reason for it.

export const dynamic = "force-dynamic";

export default async function DomainHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const { key } = await params;
  // The rule is the router: a domain with one route has no home, and asking
  // for one is asking for a page that does not exist rather than a page that
  // is empty.
  if (!hasHome(key)) notFound();

  const {
    DOMAIN_GROUP_LABEL,
    DOMAIN_GROUP_QUESTION,
    DOMAIN_LABEL,
    PLANNED_MODULE_LABEL,
    DOMAIN_FACT_LABEL,
    DOMAIN_HOME_TEXT,
    LAUNCHER_TEXT,
    TIER_LABEL,
    DEPLOYMENT_HOME_TEXT,
  } = await getMessages();

  const session = await resolveAppSession();
  if (!session) return null;
  // Unreachable: (app)/layout.tsx already renders the shared SignIn
  // screen and never mounts this page when there is no session. Kept
  // only because TypeScript needs it to narrow `session` below.

  const nav = resolveNavigation(session.authz, session.entitlement);
  const domain = resolveFunctionalDomains(nav).find((d) => d.key === key);
  // Every built module refused on permission AND nothing planned. The domain
  // is not "empty" for this member, it is not theirs - and 404 says that
  // without listing what they cannot have.
  if (!domain) notFound();

  const context = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    stores: session.stores,
    scope: session.scope,
  };
  const rawYear = key === "deployment" ? (await searchParams).year : undefined;
  if (rawYear !== undefined && (typeof rawYear !== "string" || !/^\d{4}$/.test(rawYear) || Number(rawYear) < 2000 || Number(rawYear) > 2200))
    return <EmptyState title={DEPLOYMENT_HOME_TEXT.invalidYear} />;
  const year = rawYear === undefined ? new Date().getUTCFullYear() : Number(rawYear);
  const deployment = key === "deployment"
    ? await readDeploymentOverview(salesPlanContext(session), year, new Date().toISOString())
    : null;
  const facts = deployment ? [] : await factsFor(key, context);

  const moduleLabel = (m: ResolvedModule) =>
    m.kind === "built"
      ? (DOMAIN_LABEL[m.key] ?? m.key)
      : (PLANNED_MODULE_LABEL[m.key] ?? m.key);

  const moduleHref = (m: Exclude<ResolvedModule, { kind: "planned" }>) => {
    if (deployment && m.key === "planning") return `/planning?year=${year}`;
    if (deployment && m.key === "attainment") return `/attainment?period=Y${year}`;
    if (deployment && m.key === "namedAccount") return `/named?year=${year}&period=Y${year}`;
    if (deployment && m.key === "winLossReview") return `/winloss?period=Y${year}`;
    return m.href;
  };
  const moduleDescription = (m: Exclude<ResolvedModule, { kind: "planned" }>) => {
    if (m.kind === "section") return LAUNCHER_TEXT.section;
    if (m.state === "locked") {
      if (!m.requiredTier) return LAUNCHER_TEXT.lockedNoTier;
      return LAUNCHER_TEXT.locked(TIER_LABEL[m.requiredTier] ?? m.requiredTier);
    }
    if (deployment) return DEPLOYMENT_HOME_TEXT.modules[m.key];
    return m.href;
  };

  return (
    <ViewLayout>
      {/* A DOMAIN HOME sits under the launcher, and the launcher lives on
          the home overview - the one page that is nobody's child. */}
      <PageCrumbs
        trail={[{ label: DOMAIN_LABEL.home, href: "/" }]}
        current={DOMAIN_GROUP_LABEL[key] ?? key}
      />
      <ViewHeader
        icon={domain.icon}
        title={DOMAIN_GROUP_LABEL[key] ?? key}
        help={DOMAIN_GROUP_QUESTION[key] ?? ""}
        divider
        pageActions={deployment ? { context: <DeploymentYearControl year={year} label={DEPLOYMENT_HOME_TEXT.year} submit={DEPLOYMENT_HOME_TEXT.applyYear} /> } : undefined}
      />

      {deployment ? <DeploymentOverviewPanel summary={deployment} year={year} canViewAttainment={domain.modules.some(m => m.kind === "built" && m.key === "attainment" && m.state === "visible")} /> : <Section
        icon="chart-bar"
        title={DOMAIN_HOME_TEXT.factsTitle}
        help={DOMAIN_HOME_TEXT.factsWhy}
      >
        {facts.length === 0 ? (
          // Not "nothing is happening" - every read was refused. Saying it
          // plainly beats a grid of dashes that reads as a broken page.
          <EmptyState
            title={DOMAIN_HOME_TEXT.factsDeniedTitle}
            description={DOMAIN_HOME_TEXT.factsDeniedWhy}
          />
        ) : (
          <div className="grid grid-cols-2 gap-md md:grid-cols-3">
            {facts.map((f) => (
              <Link
                key={f.key}
                href={f.href}
                className="hover:border-primary flex flex-col gap-2xs rounded-md border p-md"
              >
                <span className="text-muted-foreground text-body-small">
                  {DOMAIN_FACT_LABEL[f.key] ?? f.key}
                </span>
                <span className="flex items-baseline gap-xs">
                  <span className="text-2xl text-foreground tabular-nums">
                    {f.value}
                  </span>
                  {/* Only a backlog earns the badge. An inventory figure is a
                      size, not a task, and painting both the same colour would
                      make the colour say nothing. */}
                  {f.attention ? (
                    <StatusBadge tone="warning">
                      {DOMAIN_HOME_TEXT.needsAttention}
                    </StatusBadge>
                  ) : null}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>}

      <Section
        icon="squares-four"
        title={deployment ? DEPLOYMENT_HOME_TEXT.modulesTitle : DOMAIN_HOME_TEXT.modulesTitle}
        help={DOMAIN_HOME_TEXT.modulesWhy}
      >
        <div className="grid grid-cols-1 gap-sm md:grid-cols-3">
          {domain.modules.map((m) =>
            m.kind === "planned" ? (
              <div
                key={`planned-${m.key}`}
                className="text-muted-foreground flex flex-col gap-2xs rounded-md border border-dashed p-md"
              >
                <span>{moduleLabel(m)}</span>
                <span className="text-body-small">{LAUNCHER_TEXT.planned}</span>
              </div>
            ) : (
              <Link
                key={m.kind === "section" ? `section-${m.key}` : m.key}
                href={moduleHref(m)}
                className="hover:border-primary flex flex-col gap-2xs rounded-md border p-md"
              >
                <span className="flex items-center gap-xs text-body text-foreground"><Icon name={m.icon} size="sm" />{moduleLabel(m)}</span>
                <span className={deployment ? "text-muted-foreground text-body" : "text-muted-foreground text-body-small"}>
                  {moduleDescription(m)}
                </span>
              </Link>
            ),
          )}
        </div>
      </Section>
    </ViewLayout>
  );
}
