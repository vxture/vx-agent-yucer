import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, StatusBadge, ViewHeader, ViewLayout } from "@vxture/design-ui";
import { PageCrumbs } from "../../components/page-crumbs";
import { resolveAppSession } from "../../lib/session";
import { getMessages } from "../../lib/i18n/server";
import { can } from "../../../authz/decide";

/* 待迁路由 (owner, 2026-09-11: 盘点所有未在页面体现的路由，做一个临时域，
 * 先挂到里面 - 标记：待迁移).
 *
 * A HOLDING PAGE, not a domain. functional-domains.ts's 5 domains are a
 * test-locked count; this sits under admin's own menu instead, the same
 * plane every other "just a settings/ops page" lives on.
 *
 * WHAT BELONGS HERE: a page whose code is real and complete, but that no
 * navigation entry and no in-app link (button, card action, breadcrumb)
 * reaches - checked across the whole app, not guessed. `/account/complete`
 * is the one found this way (2026-09-11): D4's batch completeness page,
 * fully built, genuinely unreachable except by typing the URL.
 *
 * A ROUTE LEAVES THIS LIST one of two ways: a real entry point is added for
 * it, or the feature it belongs to is retired outright - never by quietly
 * forgetting it here.
 */

export const dynamic = "force-dynamic";

interface PendingRoute {
  readonly href: string;
  readonly label: string;
}

export default async function PendingMigrationPage() {
  const { ADMIN_PAGE_TEXT, ADMIN_TEXT, DOMAIN_LABEL, SHELL_TEXT } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }
  if (!can(session.authz, session.entitlement, "admin.member.view", "ui").allowed) {
    return <EmptyState title={ADMIN_TEXT.emptyTitle} description={ADMIN_TEXT.emptyDescription} />;
  }

  const routes: readonly PendingRoute[] = [
    { href: "/account/complete", label: ADMIN_PAGE_TEXT.pendingMigrationAccountComplete },
  ];

  return (
    <ViewLayout>
      <PageCrumbs
        trail={[{ label: ADMIN_TEXT.title, href: "/admin" }]}
        current={DOMAIN_LABEL.pendingMigration}
      />
      <ViewHeader
        icon="archive"
        title={ADMIN_PAGE_TEXT.pendingMigrationTitle}
        description={ADMIN_PAGE_TEXT.pendingMigrationWhy}
        secondary={<StatusBadge tone="warning">{ADMIN_PAGE_TEXT.pendingMigrationCount(routes.length)}</StatusBadge>}
      />
      {routes.length === 0 ? (
        <EmptyState title={ADMIN_PAGE_TEXT.pendingMigrationEmpty} description="" />
      ) : (
        <div className="gap-md flex flex-col">
          {routes.map((r) => (
            <Card key={r.href}>
              <CardHeader>
                <CardTitle>
                  <Link href={r.href} className="hover:underline">{r.href}</Link>
                </CardTitle>
                <CardDescription>{r.label}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      )}
    </ViewLayout>
  );
}
