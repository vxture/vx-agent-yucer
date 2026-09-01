import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, EmptyState, Section, StatusBadge, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { resolveNavigation } from "../../lib/navigation";
import {
  hasHome,
  resolveFunctionalDomains,
  type ResolvedModule,
} from "../../lib/functional-domains";
import { factsFor } from "./facts";

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
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  // The rule is the router: a domain with one route has no home, and asking
  // for one is asking for a page that does not exist rather than a page that
  // is empty.
  if (!hasHome(key)) notFound();

  const {
    SHELL_TEXT,
    DOMAIN_GROUP_LABEL,
    DOMAIN_GROUP_QUESTION,
    DOMAIN_LABEL,
    PLANNED_MODULE_LABEL,
    DOMAIN_FACT_LABEL,
    DOMAIN_HOME_TEXT,
    LAUNCHER_TEXT,
    TIER_LABEL,
  } = await getMessages();

  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const nav = resolveNavigation(session.authz, session.entitlement);
  const domain = resolveFunctionalDomains(nav).find((d) => d.key === key);
  // Every built module refused on permission AND nothing planned. The domain
  // is not "empty" for this member, it is not theirs - and 404 says that
  // without listing what they cannot have.
  if (!domain) notFound();

  const facts = await factsFor(key, {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  });

  const moduleLabel = (m: ResolvedModule) =>
    m.kind === "built" ? (DOMAIN_LABEL[m.key] ?? m.key) : (PLANNED_MODULE_LABEL[m.key] ?? m.key);

  return (
    <ViewLayout>
      <Card className="p-lg">
        {/* ONE child, so Card's gap-xl never fires between a title and its own
            caption - the shape every first-level page in this product uses. */}
        <div className="flex flex-col gap-2xs">
          <h1 className="text-heading-2 text-foreground">
            {DOMAIN_GROUP_LABEL[key] ?? key}
          </h1>
          <p className="text-muted-foreground text-body-sm">
            {DOMAIN_GROUP_QUESTION[key] ?? ""}
          </p>
        </div>
      </Card>

      <Section
        icon="chart-bar"
        title={DOMAIN_HOME_TEXT.factsTitle}
        description={DOMAIN_HOME_TEXT.factsWhy}
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
                <span className="text-muted-foreground text-xs">
                  {DOMAIN_FACT_LABEL[f.key] ?? f.key}
                </span>
                <span className="flex items-baseline gap-xs">
                  <span className="text-heading-3 text-foreground tabular-nums">
                    {f.value}
                  </span>
                  {/* Only a backlog earns the badge. An inventory figure is a
                      size, not a task, and painting both the same colour would
                      make the colour say nothing. */}
                  {f.attention ? (
                    <StatusBadge tone="warning">{DOMAIN_HOME_TEXT.needsAttention}</StatusBadge>
                  ) : null}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section
        icon="squares-four"
        title={DOMAIN_HOME_TEXT.modulesTitle}
        description={DOMAIN_HOME_TEXT.modulesWhy}
      >
        <div className="grid grid-cols-1 gap-sm md:grid-cols-3">
          {domain.modules.map((m) =>
            m.kind === "planned" ? (
              <div
                key={`planned-${m.key}`}
                className="text-muted-foreground flex flex-col gap-2xs rounded-md border border-dashed p-md"
              >
                <span>{moduleLabel(m)}</span>
                <span className="text-xs">{LAUNCHER_TEXT.planned}</span>
              </div>
            ) : (
              <Link
                key={m.kind === "section" ? `section-${m.key}` : m.key}
                href={m.href}
                className="hover:border-primary flex flex-col gap-2xs rounded-md border p-md"
              >
                <span className="text-foreground">{moduleLabel(m)}</span>
                <span className="text-muted-foreground text-xs">
                  {m.kind === "section"
                    ? LAUNCHER_TEXT.section
                    : m.state === "locked"
                      ? m.requiredTier
                        ? LAUNCHER_TEXT.locked(TIER_LABEL[m.requiredTier] ?? m.requiredTier)
                        : LAUNCHER_TEXT.lockedNoTier
                      : m.href}
                </span>
              </Link>
            ),
          )}
        </div>
      </Section>
    </ViewLayout>
  );
}
