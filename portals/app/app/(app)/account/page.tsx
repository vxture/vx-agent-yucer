import { Card, EmptyState, Section, ViewLayout } from "@vxture/design-ui";
import { can } from "../../authz/decide";
import { resolveAppSession } from "../lib/session";
import {
  getAccountStore,
  getFieldStore,
  getPlanningStore,
  getStrategyStore,
} from "../../domains/shared/registry";
import { listAccounts, workspaceCompleteness } from "../../domains/account/service";
import { listCommitments } from "../../domains/account/field-service";
import { AccountTable } from "../components/account-table";
import { listSegments } from "../../domains/strategy/service";
import { OverdueCommitments } from "../components/overdue-commitments";

import { getMessages } from "../lib/i18n/server";
import { cachedFeed } from "../lib/board";
import { loadFailureText } from "../lib/load-failure";
// D4 account list.
//
// Ordered sickest-first by the store, which is a product decision rather than a
// default: a customer list sorted by name is a directory, and a directory is
// not what a salesperson opens on a Monday. The unscored rows sort last -
// "never assessed" is not the same as "in trouble".

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const { ACCOUNT_TEXT, SHELL_TEXT, LOAD_ERROR } = await getMessages();
  const session = await resolveAppSession();
  if (!session) {
    return (
      <EmptyState
        title={SHELL_TEXT.signedOutTitle}
        description={SHELL_TEXT.signedOutDescription}
      />
    );
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const now = new Date();
  const [result, overdue, segments, feed, completeness] = await Promise.all([
    listAccounts({ ...ctx, store: session.stores.account() }),
    listCommitments(
      { ...ctx, store: getFieldStore() },
      { overdueAt: now, limit: 20 },
    ),
    // D1's definitions, read across the domain boundary to turn segment codes
    // into names. Gated separately (strategy.segment.view) - a member without
    // it sees the raw codes, which is the honest degradation: the reference on
    // the account is theirs to see, the definition is not.
    listSegments({ ...ctx, store: getStrategyStore() }),
    // The SAME memoised feed the shell and the home screen read: which
    // accounts have no reachable economic buyer. It was a count on a board
    // card, which said the workspace had a problem without saying which
    // customer had it.
    cachedFeed(ctx),
    // Just the count, to decide whether the banner is worth a line. The
    // /account/complete page runs this same call to render the table - a
    // second pass over the same three domains, not a shared cache, matching
    // how every other page-level fact here is computed fresh per render.
    workspaceCompleteness({
      ...ctx,
      store: session.stores.account(),
      pipeline: session.stores.pipeline(),
      planning: getPlanningStore(),
      strategy: getStrategyStore(),
    }),
  ]);

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={loadFailureText(result.violations, LOAD_ERROR)}
      />
    );
  }

  // Names live on the account row, not on the commitment - an overdue promise
  // that shows a UUID is one nobody chases.
  const names = new Map(result.value.map((a) => [a.id, a.name]));

  // Said in the headline rather than per row: the list is ordered sickest-first,
  // and a reader who does not know that reads the top of it as "most important
  // customers". The ordering is a claim, so the page makes it out loud.
  const atRisk = result.value.filter(
    (a) => a.healthScore !== null && a.healthScore < 60,
  ).length;
  const overdueCount = overdue.ok ? overdue.value.length : 0;
  const completableCount = completeness.ok
    ? new Set(completeness.value.map((r) => r.accountId)).size
    : 0;

  return (
    <ViewLayout>
      {/* Opens with what is true of the whole page, the same way /signal does.
          It used to start cold on a section heading, so a reader arrived with
          no idea how many customers there were or why they were in this order. */}
      <Card className="p-lg">
        {/* ONE child, so Card's gap-xl never fires between a title and its
            own captions. */}
        <div className="flex flex-col gap-2xs">
          <h1 className="text-heading-2 text-foreground">
            {ACCOUNT_TEXT.lead(result.value.length)}
          </h1>
          {overdueCount > 0 ? (
            <p className="text-body-sm text-(color:--warning-muted-foreground)">
              {ACCOUNT_TEXT.leadOverdue(overdueCount)}
            </p>
          ) : null}
          <p className="text-muted-foreground text-body-sm">
            {atRisk > 0
              ? ACCOUNT_TEXT.leadAtRisk(atRisk)
              : ACCOUNT_TEXT.leadOrder}
          </p>
          {completableCount > 0 ? (
            <p className="text-body-sm text-(color:--info-muted-foreground)">
              {ACCOUNT_TEXT.batchCompleteBanner(completableCount)}
              {" - "}
              <a href="/account/complete" className="underline">
                {ACCOUNT_TEXT.batchCompleteLink}
              </a>
            </p>
          ) : null}
        </div>
      </Card>

      {/* Above the list on purpose. The list answers "who are my customers";
          this answers "what is already going wrong", and only one of those is
          worth the top of a Monday screen. */}
      {overdue.ok ? (
        <OverdueCommitments
          now={now}
          rows={overdue.value.map((c) => ({
            id: c.id,
            accountId: c.accountId,
            accountName: names.get(c.accountId) ?? c.accountId,
            direction: c.direction,
            statement: c.statement,
            dueAt: c.dueAt,
            ownerSub: c.ownerSub,
          }))}
        />
      ) : null}

      <Section
        icon="user"
        title={ACCOUNT_TEXT.title}
        description={ACCOUNT_TEXT.description}
      >
        {/* Decides which menu item renders ENABLED, nothing more. The server
            action re-runs the same gate on `account.upsert` before it writes,
            so a stale flag costs a refused request rather than an unguarded
            one - and the item stays visible either way, disabled with the
            reason. */}
        <AccountTable
          rows={result.value}
          buyerUnreachable={
            new Set(feed.ok ? feed.value.unreachableAccountIds : [])
          }
          segmentNames={
            segments.ok
              ? new Map(segments.value.map((g) => [g.segmentCode, g.name]))
              : undefined
          }
          canRecompute={
            can(session.authz, session.entitlement, "account.upsert", "ui")
              .allowed
          }
        />
      </Section>
    </ViewLayout>
  );
}
