import { EmptyState, PageSection } from "@vxture/design-system";
import { resolveAppSession } from "../lib/session";
import { ACCOUNT_TEXT, SHELL_TEXT } from "../lib/messages";
import { getAccountStore, getFieldStore } from "../../domains/shared/registry";
import { listAccounts } from "../../domains/account/service";
import { listCommitments } from "../../domains/account/field-service";
import { AccountTable } from "../components/account-table";
import { OverdueCommitments } from "../components/overdue-commitments";

// D4 account list.
//
// Ordered sickest-first by the store, which is a product decision rather than a
// default: a customer list sorted by name is a directory, and a directory is
// not what a salesperson opens on a Monday. The unscored rows sort last -
// "never assessed" is not the same as "in trouble".

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await resolveAppSession();
  if (!session) {
    return <EmptyState title={SHELL_TEXT.signedOutTitle} description={SHELL_TEXT.signedOutDescription} />;
  }

  const ctx = {
    workspaceId: session.workspaceId,
    sub: session.user.sub,
    holder: session.authz,
    entitlement: session.entitlement,
  };

  const now = new Date();
  const [result, overdue] = await Promise.all([
    listAccounts({ ...ctx, store: getAccountStore() }),
    listCommitments({ ...ctx, store: getFieldStore() }, { overdueAt: now, limit: 20 }),
  ]);

  if (!result.ok) {
    return (
      <EmptyState
        title={SHELL_TEXT.loadFailed}
        description={result.violations.map((v) => v.message).join("; ")}
      />
    );
  }

  // Names live on the account row, not on the commitment - an overdue promise
  // that shows a UUID is one nobody chases.
  const names = new Map(result.value.map((a) => [a.id, a.name]));

  return (
    <>
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

      <PageSection title={ACCOUNT_TEXT.title} description={ACCOUNT_TEXT.description}>
        <AccountTable rows={result.value} />
      </PageSection>
    </>
  );
}
