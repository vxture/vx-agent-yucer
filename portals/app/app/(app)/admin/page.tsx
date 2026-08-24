import Link from "next/link";
import { EmptyState, PanelCard, Section, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { resolveAppSession } from "../lib/session";
import { ADMIN_TEXT, DOMAIN_LABEL, SHELL_TEXT } from "../lib/messages";
import { resolveNavigation, ADMIN_NAV_ENTRIES } from "../lib/navigation";

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
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const nav = resolveNavigation(session.authz, session.entitlement);
  const keys = new Set(ADMIN_NAV_ENTRIES.map((e) => e.key));
  const entries = nav.filter((e) => keys.has(e.key) && e.state === "visible");

  return (
    <ViewLayout>
      <ViewHeader icon="settings" title={ADMIN_TEXT.title} description={ADMIN_TEXT.description} />

      {entries.length === 0 ? (
        <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />
      ) : (
        <Section>
          <div className="grid gap-3 sm:grid-cols-2">
            {entries.map((e) => (
              <Link key={e.key} href={e.href} className="no-underline">
                <PanelCard
                  icon={e.icon}
                  title={DOMAIN_LABEL[e.key] ?? e.key}
                  description={ADMIN_TEXT.entryHint[e.key] ?? ""}
                >
                  <span className="text-muted-foreground text-sm">{e.href}</span>
                </PanelCard>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </ViewLayout>
  );
}
