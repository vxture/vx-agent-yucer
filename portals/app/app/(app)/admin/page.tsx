import Link from "next/link";
import {
  EmptyState,
  Icon,
  PanelCard,
  Section,
  ViewHeader,
  ViewLayout,
} from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { ADMIN_TEXT, DOMAIN_LABEL, SHELL_TEXT } from "../lib/messages";
import { resolveNavigation, ADMIN_NAV_ENTRIES } from "../lib/navigation";
import { getAuthzStore } from "../../authz/store";
import { listWorkspaceMembers } from "../../authz/admin";
import { CAPTURE_CRITERION } from "../../domains/account/lib/capture-metric";

// Administration, as its own domain rather than a sidebar group.
//
// It is neither work nor data: it is setup, visited rarely and usually for one
// specific reason. A permanent group in the sidebar spent height on something
// nobody opens on a Monday, so it moved behind a single header icon and this
// page is what that icon opens.
//
// Entries are filtered by the SAME resolveNavigation the shell uses, so a
// member who cannot administer sees an empty page rather than a set of links
// that will refuse them. Showing a door you cannot open is not access control
// and it is not honesty either.

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
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
  const keys = new Set(ADMIN_NAV_ENTRIES.map((e) => e.key));
  const entries = nav.filter((e) => keys.has(e.key) && e.state === "visible");

  // A LIVE FACT PER CARD, because the cards used to print their own href as
  // body text - a URL is neither something a reader wants nor something they
  // can act on. The member count is one gated call; adoption's number would
  // cost a whole pipeline scan for a landing card, so that card states the
  // CRITERION instead. Telling someone what a page measures by is honest and
  // cheap; making them wait for a number they came here to go and read is not.
  const members = await listWorkspaceMembers({
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
    store: getAuthzStore(),
  });
  const memberFact = !members.ok
    ? ADMIN_TEXT.memberNoRead
    : members.value.length === 0
      ? ADMIN_TEXT.memberNone
      : ADMIN_TEXT.memberCount(
          members.value.length,
          new Set(members.value.flatMap((m) => m.roles ?? [])).size,
        );
  const adoptionFact = ADMIN_TEXT.adoptionCriterion(
    CAPTURE_CRITERION.windowWeeks,
    CAPTURE_CRITERION.judgeWeeks,
  );

  return (
    <ViewLayout>
      <ViewHeader
        icon="settings"
        title={ADMIN_TEXT.title}
        description={ADMIN_TEXT.description}
      />

      {entries.length === 0 ? (
        <EmptyState
          title={ADMIN_TEXT.emptyTitle}
          description={ADMIN_TEXT.emptyDescription}
        />
      ) : (
        <Section>
          {/* gap-md, not gap-3. It was the ONLY naked numeric spacing utility
              left in the app - everything else is on the DS scale - and a lone
              12px that does not come from a token is exactly the kind of drift
              that is invisible until six of them disagree. */}
          <div className="grid gap-md sm:grid-cols-2">
            {entries.map((e) => (
              <Link key={e.key} href={e.href} className="no-underline">
                <PanelCard
                  icon={e.icon}
                  title={DOMAIN_LABEL[e.key] ?? e.key}
                  description={ADMIN_TEXT.entryHint[e.key] ?? ""}
                >
                  <span className="flex items-center justify-between gap-md">
                    <span className="text-muted-foreground text-body-sm">
                      {e.key === "admin" ? memberFact : adoptionFact}
                    </span>
                    <Icon name="arrow-right" size="xs" />
                  </span>
                </PanelCard>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </ViewLayout>
  );
}
